# connect to AMG server / mysql
# poll on interval / based on device schedule
# send updates to mongo, tailable collection

# init.py
import os
import asyncio
import aiomysql
import pymongo
import configparser
from typing import List
from pprint import pprint
from functools import reduce
from pymongo.errors import ConnectionFailure
from bson.codec_options import TypeRegistry, CodecOptions
from bson.objectid import ObjectId
import motor.motor_asyncio
from enum import Enum, IntEnum
from aioitertools import groupby, enumerate
from datetime import timedelta, datetime, timezone
from itertools import zip_longest, islice
import models

from util import get_async_rpc_connection, merge_nearby_shifts, parse_timecards_2, get_mysql_db, get_mongo_db


async def init(config, force=False):
    mysql_client = await get_mysql_db(config['MYSQL'])
    mongo_client = await get_mongo_db(config['MONGO'])

    amg_rpc_proxy = get_async_rpc_connection(config['AMG'])

    mongo_db = mongo_client.timeclock

    collection_names = await mongo_db.list_collection_names()

    mysql_cursor = await mysql_client.cursor(aiomysql.DictCursor)
    if force or 'employees' not in collection_names:
        await mysql_cursor.execute('select id,Code,Name,MiddleName,LastName,HireDate from tam.inf_employee')

        employee_ids = [];
        employees = {}
        async for i, employee in enumerate(wrap_fetchone(mysql_cursor)):
            color = models.EmployeeShiftColor(i % len(models.EmployeeShiftColor))
            employee_id = str(employee['id'])
            employee_ids.append(employee_id)
            employee['id'] = employee_id
            employee['Color'] = color
            employees[employee['id']] = employee;

        await mongo_db.drop_collection('employees')
        col = mongo_db.get_collection('employees')
        await col.create_index('id', unique=True)
        await col.insert_many(employees.values())
    else:
        employees = await mongo_db.employees.find({}).to_list(2000)
        employee_ids = [empl['id'] for empl in employees]

    if force or 'polls' not in collection_names:
        await mongo_db.drop_collection('polls')

    latest_poll = await mongo_db.polls.find_one({}, sort=[('date', pymongo.DESCENDING)])
    if latest_poll is None:
        await mysql_cursor.execute('select StartTime from tam.polllog order by StartTime desc')
    else:
        await mysql_cursor.execute('select StartTime from tam.polllog where StartTime > %s order by StartTime desc', (latest_poll['date'],))

    if mysql_cursor.rowcount:
        polls = [{'date': date} for date, *_ in await mysql_cursor.fetchall()]
        result = await mongo_client.timeclock.polls.insert_many(polls)
        latest_poll = await mongo_db.polls.find_one({'_id': result.inserted_ids[0]})


    type_registry = TypeRegistry(fallback_encoder=timedelta_encoder)
    codec_options = CodecOptions(type_registry=type_registry)
    shifts_collection = mongo_db.get_collection('shifts', codec_options=codec_options)

    if force or 'shifts' not in collection_names:
        await mongo_db.drop_collection('shifts')
        await mongo_db.drop_collection('sync_history')
        # problematic
        #await shifts_collection.create_index([('start', pymongo.DESCENDING), ('employee', pymongo.ASCENDING)], unique=True)
        await shifts_collection.create_index('start')
        await shifts_collection.create_index('end')
        await shifts_collection.create_index('employee')

    latest_sync = await mongo_db.sync_history.find_one({}, sort=[('date', pymongo.DESCENDING)])

    now = datetime.now()
    interval = timedelta(weeks=2)

    if latest_sync is None:
        min_date = get_sunday(now - timedelta(days=365))

    # no poll since last sync
    #elif latest_sync['poll']['date'] >= latest_poll['date']:
    #    return
    else:
        min_date = get_sunday(now)

    shifts = []
    while min_date < now:
        max_date = min_date + interval
        print(f'{min_date} - {max_date}')
        shifts = await get_employee_shifts(amg_rpc_proxy, employee_ids, (min_date, max_date))
        if len(shifts):
            await shifts_collection.insert_many(shifts)
        min_date = max_date

    await mongo_db.sync_history.insert_one({'poll': latest_poll, 'date': now, 'min': min_date})

    last_employee = None
    last_start = None
    last_end = None
    last_id = None
    last_duration = None
    duplicates = []
    async for doc in shifts_collection.find().sort([('employee', pymongo.ASCENDING), ('start', pymongo.ASCENDING)]):
        _id = doc['_id']
        employee = doc['employee']
        if employee != last_employee:
            last_employee = employee
            last_start = None
            last_end = None
            last_id = None
            last_duration = None

        start = doc['start']
        end = doc['end']
        duration = doc['duration']

        if last_end is not None and start is not None and start < last_end:
            if duration is None:
                duplicates.append(_id)
            elif last_duration is None:
                duplicates.append(last_id)
                pass
            else:
                duplicates.append(last_id if duration > last_duration else _id)

        last_start = start
        last_end = end
        last_id = _id
        last_duration = duration

    if len(duplicates):
        await shifts_collection.delete_many({'_id': {'$in': duplicates}});

    # calculate count, avg / stdDev for start, end, duration of shift
    pipeline = [
      {'$match': {'end': {'$ne': None}}},
      {'$addFields': {
          'startParts': {'$dateToParts': {'date': '$start'}},
          'endParts': {'$dateToParts': {'date': '$end'}}
      }},
      {'$addFields': {
          'startSecs': {
              '$add': [
                  '$startParts.millisecond',
                  {'$multiply': ['$startParts.second', 1000]},
                  {'$multiply': ['$startParts.minute', 60000]},
                  {'$multiply': ['$startParts.hour', 60*60*1000]}
              ]},
          'endSecs': {
              '$add': [
                  '$endParts.millisecond',
                  {'$multiply': ['$endParts.second', 1000]},
                  {'$multiply': ['$endParts.minute', 60000]},
                  {'$multiply': ['$endParts.hour', 60*60*1000]}
              ]}
      }},
      {'$addFields': {
          # compensate for overnight shifts
          'endSecs': {'$cond': {
              'if': { '$gte': [ '$startSecs', '$endSecs' ] },
              'then': {'$add': ['$endSecs', 24*60*60*1000]},
              'else': '$endSecs'
              }},
          'duration': {'$divide': ['$duration', 3.6e6]}
      }},
      {'$group': {
          '_id': '$employee',
          'start': {'$avg': '$startSecs'},
          'end': {'$avg': '$endSecs'},
          'duration': {'$avg': '$duration'},
          'stdDev': {'$stdDevPop': '$duration'},
          'count': {'$sum': 1},
          'asOf': {'$max': '$end'},
      }},
      {'$addFields': {
          'count': {'$toInt': '$count'},
          'start': {'$dateFromParts': {'year': 2000, 'month': 1, 'day': 1, 'millisecond': {'$toInt': '$start'}}},
          'end': {'$dateFromParts': {'year': 2000, 'month': 1, 'day': 1, 'millisecond': {'$toInt': '$end'}}},
          'calculatedOn': now + timedelta(hours=5), # irritating
      }},
      {'$project': {'stats': '$$ROOT'}},
      {'$project': {'stats': 1, 'id': '$_id', '_id': 0}},
      # add 'stats' property to employee docs
      {'$merge': {'into': 'employees', 'on': 'id'}}
    ]

    # add stats for each employee
    async for doc in shifts_collection.aggregate(pipeline):
        pass


    await amg_rpc_proxy.close()
    await mysql_cursor.close()
    mongo_client.close()


async def get_employee_shifts(proxy, employee_ids, date_range):
    ids = [int(s) for s in employee_ids]
    employee_timecards = await proxy.GetTimecards(ids, *date_range, False)
    now = datetime.now()
    shifts = []
    for each in employee_timecards:
        employee_id, timecards = each['EmployeeId'], each['Timecards']

        for components in parse_timecards_2(employee_id, timecards):
            start_date = components[0]['start']
            end_date = components[-1]['end']
            is_complete = end_date is not None

            total_duration = reduce(lambda t, c: (c['end'] or now) - c['start'], components, timedelta())

            shift_state = models.ShiftState.Complete if is_complete else models.ShiftState.Incomplete

            is_flagged = False
            if not is_complete and (total_duration and total_duration > timedelta(hours=24)):
                is_flagged = True
            elif not is_complete and (now - start_date) > timedelta(hours=24):
                is_flagged = True

            shifts.append({
                'flagged': is_flagged,
                'employee': str(employee_id),
                'components': components,
                'start': start_date,
                'end': end_date,
                'duration': total_duration if is_complete else timedelta(),
                'state': shift_state
            })
    return shifts



def timedelta_encoder(value):
    if isinstance(value, timedelta):
        return int(value.total_seconds() * 1000)
    if isinstance(value, Enum):
        return value.value
    return value


def get_sunday(dt: datetime):
    dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    dt = dt - timedelta(days=(dt.weekday() + 1) % 7)
    return dt


async def wrap_fetchone(mysql_cursor: aiomysql.Cursor):
    while (item := await mysql_cursor.fetchone()):
        yield item


def seq_grouper(it, max_diff=timedelta(hours=4)):
    last_end = None
    items = []
    for pair in it:
        start, end = pair
        if last_end is None or (start - last_end) < max_diff:
            items.append(pair)
        elif len(items):
            yield items
            items = [pair]
        last_end = end

    if len(items):
        yield items


def grouper(iterable, n=2, fillvalue=None):
    args = [iter(iterable)] * n
    return zip_longest(*args, fillvalue=fillvalue)


if __name__ == '__main__':
    config_path = os.path.join(os.path.dirname(__file__), 'config.ini');
    if not os.path.isfile(config_path):
        raise RuntimeError('no config file found')
    config = configparser.ConfigParser()
    config.read(config_path)

    asyncio.run(init(config, True))


# daemon.py
# connect to database                            check that connection is established
#   on disconnect, retry reconnect with backoff  check that reconnect attempted after disconnect
# poll database                                  check that latest record poll is retrieved
# if new record(s) in polllog                    check that after adding record, new record is found
#   read from tr_clock latest punches            check that correct set of punches is retrieved / identified
# check again after interval                     check that second poll after duration occurs

import asyncio
import aiomysql
from contextlib import asynccontextmanager
from pymysql.err import OperationalError


def get_connection(args = {}):
    return aiomysql.connect(**args)


async def main():
    conn = None
    delay = 1
    while True:
        try:
            conn = await get_connection({'host': '127.0.0.1', 'user': 'root', 'password': 'toast', 'db': 'tam', 'port':3306})
            delay = 1
            break
        except OperationalError as e:
            code, msg = e.args
            print(f'{msg} ({code}).  Retrying after {delay}s')
            await asyncio.sleep(delay)
            if delay < 300: delay *= 2

    last_poll = None
    latest_punch_id = None
    async with conn:
        while True:
            async with conn.cursor() as cur:
                await cur.execute('SELECT version()')
                version, = await cur.fetchone()
                print(f'{version=}')

                #await cur.execute('describe polllog')
                #print(await cur.fetchall())

                await cur.execute('select StartTime from polllog limit 1')
                result = await cur.fetchone()
                if result:
                    poll_date, = result
                    print(poll_date)

                await cur.execute('describe inf_employee')
                rows = await cur.fetchall()
                print('\n'.join([r for r,*_ in rows]))

                #await cur.execute('select id,Code,Name,MiddleName,LastName,HireDate from inf_employee')
                #rows = await cur.fetchall()
                #print('\n'.join([', '.join(map(str, r)) for r in rows]))

                sql = 'select id,inf_employee_id,Date from tr_clock order by id'
                if latest_punch_id is None:
                    await cur.execute(sql)
                else:
                    await cur.execute(f'{sql} where id > ?', (latest_punch_id,))

                async def gen():
                    while (row := await cur.fetchone()):
                        yield row

                async for row in gen():
                    print(row)
                    break

                    #await cur.execute('show tables');
                    #rows = await cur.fetchall()
                    #print('\n'.join([r for r, in rows]))

            break
            await asyncio.sleep(10)


if __name__ == '__main__':
    asyncio.run(main())


# main.py
import os
import json
import asyncio
import pathlib
import weakref
import configparser
import xmlrpc.client
import logging
from contextvars import ContextVar
from aiohttp_xmlrpc.client import ServerProxy
from aiohttp import web, WSCloseCode
from datetime import datetime, date, timedelta

from util import get_async_rpc_connection, parse_timecards


# how often is timeclock polled by PC (set on PC)
POLL_INTERVAL = timedelta(minutes=60)

# how long does the polling take to make it into system
POLL_PADDING = timedelta(minutes=1)

# how often should refresh be attempted if past POLL_INTERVAL
POLL_RETRY_INTERVAL = timedelta(minutes=1)

last_state = {}

routes = web.RouteTableDef()

if os.environ.get('env') != 'production': 
    @routes.get('/')
    async def index(request):
        return web.FileResponse('./index.html')
    
    @routes.get('/manifest.json')
    async def index(request):
        return web.FileResponse('../manifest.json')


@routes.get('/socket')
async def websocket_handler(request):

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    request.app['websockets'].add(ws)


    s = json.dumps(last_state, default=default)
    await ws.send_str(s)

    try:
        async for msg in ws:
            print(f'{msg=}')
    finally:
        request.app['websockets'].discard(ws)

    print('websocket connection closed')
    return ws


def default(o):
    if isinstance(o, datetime):
        return o.isoformat()


async def get_last_poll_time(proxy: ServerProxy, device_name='Handpunch') -> datetime:
    devices = await proxy.GetDevices([])
    device = next(device for device in devices if device_name in device.get('Name', ''))
    return device['LastPollTime']


async def get_shifts(proxy: ServerProxy, end_date = datetime.now() + timedelta(days=1), start_date = datetime.now() - timedelta(days=2)):
    employees_list = await proxy.GetAllEmployeesShort()
    employee_ids = [empl['Id'] for empl in employees_list]
    employees = dict(zip(employee_ids, employees_list))
    employee_timecards = await proxy.GetTimecards(employee_ids, start_date, end_date, False)

    shifts = []
    included_employees = {}
    for each in employee_timecards:
        employee_id = each['EmployeeId']
        employee_shifts = parse_timecards(employee_id, each['Timecards'])
        if len(employee_shifts):
            employee = employees[employee_id]
            included_employees[employee_id] = employee
        shifts.extend(employee_shifts)
    return shifts, employees, included_employees


async def check_timeclock(app):
    global last_state
    try:
        state = last_state
        last_poll_time = None
        new_state = {}

        while True:
            print('checking...')
            next_poll_time = await get_last_poll_time(app['proxy'])
            print(f'{next_poll_time}')
            # on first loop and when last_poll_time changes
            if last_poll_time is None or last_poll_time != next_poll_time:
                shifts, employees, employee_ids = await get_shifts(app['proxy'])
                new_state = {'shifts': shifts, 'employees': employees, 'employeeIds': employee_ids}
                last_poll_time = next_poll_time

            now = datetime.now()
            diff = last_poll_time + POLL_INTERVAL + POLL_PADDING - now
            # if last poll + interval (+ padding) has already passed, retry later
            if diff < timedelta(0):
                diff = POLL_RETRY_INTERVAL
            new_state['lastPoll'] = last_poll_time
            new_state['nextPoll'] = last_poll_time + POLL_INTERVAL
            new_state['nextRetry'] = now + diff;
            state = {**state, **new_state}
            last_state = state
            for ws in app['websockets']:
                await ws.send_str(json.dumps(state, default=default))
            wait = diff.total_seconds()
            print(f'waiting for {wait}...')
            await asyncio.sleep(wait)

    except asyncio.CancelledError:
        print('task cancelled')


    except Exception as e:
        print(e)
        print(f'encountered error: {e}')
        raise e

    finally:
        pass


async def start_background_tasks(app):
    app['timeclock_listener'] = asyncio.create_task(check_timeclock(app))


async def cleanup_background_tasks(app):
    app['timeclock_listener'].cancel()
    await app['timeclock_listener']


async def on_shutdown(app):
    for ws in set(app['websockets']):
        await ws.close(code=WSCloseCode.GOING_AWAY,
                       message='Server shutdown')
    await app['proxy'].close()


async def main(config):
    app = web.Application()
    app['websockets'] = weakref.WeakSet()

    print('got xmlrpc connection')

    app['proxy'] = get_async_rpc_connection(
        os.environ.get('AMG_HOST') or config['AMG'].get('HOST'),
        os.environ.get('AMG_PORT') or config['AMG'].get('PORT'),
        os.environ.get('AMG_PASSWORD') or config['AMG'].get('PASSWORD'),
        os.environ.get('AMG_USERNAME') or config['AMG'].get('USERNAME'))

    app.add_routes(routes)
    if os.environ.get('env') != 'production': 
        app.add_routes([web.static('/icons/', '../icons')])

    app.on_shutdown.append(on_shutdown)

    host, port = os.environ.get('SERVER_HOST', '0.0.0.0'), os.environ.get('SERVER_PORT', 8080)

    runner = web.AppRunner(app)
    await runner.setup()

    print(f'starting at {host}:{port}')
    site = web.TCPSite(runner, host, port)
    await site.start()

    try:
        await asyncio.create_task(check_timeclock(app))
    finally:
        print(f'shutting down')
        await runner.cleanup()


if __name__ == '__main__':
    if not os.path.isfile('config.ini'):
        raise RuntimeError('no config file found')
    config = configparser.ConfigParser()
    config.read('config.ini')
    asyncio.run(main(config))

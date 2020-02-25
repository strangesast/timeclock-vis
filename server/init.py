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

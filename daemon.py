# connect to AMG server / mysql
# poll on interval / based on device schedule
# send updates to mongo, tailable collection

# init.py
import os
import sys
import pymongo
import logging
import asyncio
import aiomysql
import configparser
from pprint import pprint
from datetime import datetime, timedelta
from pymongo.errors import BulkWriteError
from pymongo import ReplaceOne
from bson.codec_options import CodecOptions, TypeRegistry

import models
from util import get_async_rpc_connection, get_mysql_db, get_mongo_db, EmployeeShiftColor
from calculate_rows import recalculate


async def init(mongo_db, mysql_db, proxy):
    col_names = await mongo_db.list_collection_names()

    mysql_cursor = await mysql_db.cursor(aiomysql.DictCursor)
    ops = []

    await mysql_cursor.execute('select id,Code,Name,MiddleName,LastName,HireDate from tam.inf_employee')
    async for employee in mysql_cursor:
        employee_id = employee['id']
        color = models.EmployeeShiftColor(employee_id % len(models.EmployeeShiftColor))
        employee_id = str(employee_id)
        employee['id'] = employee_id
        employee['Color'] = color
        ops.append(ReplaceOne({'id': employee_id}, employee, upsert=True))

    await mongo_db.employees.create_index('id', unique=True)
    await mongo_db.employees.bulk_write(ops)

    if 'polls' not in col_names:
        await mongo_db.create_collection('polls');
        await mongo_db.polls.create_index('date', unique=True)

    if 'state' not in col_names:
        await mongo_db.create_collection('state', capped=True, size=100000)

    # need to replace this to calculate duration on the fly
    #await mongo_db.command({
    #    'create': 'shifts',
    #    'viewOn': 'components',
    #    'pipeline': [
    #        {
    #            '$sort': { 'employee': 1, 'start': 1 }
    #        },
    #        {
    #            '$match': { 'start': { '$ne': None }, }
    #        },
    #        {
    #            '$addFields': {
    #                #'end': { '$ifNull': [ '$end', '$$NOW' ] },
    #                'state': {'$cond': [
    #                    {'$ne': ['$end', None]},
    #                    'complete',
    #                    'incomplete'
    #                ]}}
    #        },
    #        {
    #            '$addFields': { 'duration': { '$subtract': [ '$end', '$start' ] } }
    #        },
    #        {
    #            '$group': {
    #                '_id': { 'date': '$date', 'employee': '$employee' }, 
    #                'root': { '$first': '$$ROOT' }, 
    #                #'start': { '$first': '$start' }, 
    #                #'end': { '$last': '$end' }, 
    #                'duration': { '$sum': '$duration' }, 
    #                'components': { '$push': { 'start': '$start', 'end': '$end', 'duration': '$duration' } }
    #            }
    #        },
    #        {
    #            '$addFields': {
    #                'root.components': '$components', 
    #                'root.duration': { '$divide': [ '$root.duration', 3600000 ] }, 
    #                'root.start': '$start', 
    #                'root.end': '$end'
    #            }
    #        },
    #        {
    #            '$replaceRoot': { 'newRoot': '$root' }
    #        },
    #        #{
    #        #    '$match': { 'duration': { '$lt': 24 } }
    #        #}
    #    ]})
    await mongo_db.components.create_index('start')
    await mongo_db.components.create_index('end')
    await mongo_db.components.create_index('employee')



async def main(config):
    # do some init stuff
    # on interval, recheck

    mysql_client = await get_mysql_db(config['MYSQL'])
    mongo_client = await get_mongo_db(config['MONGO'])

    amg_rpc_proxy = get_async_rpc_connection(config['AMG'])

    mongo_db = mongo_client.timeclock
    logging.info('running init')
    await init(mongo_db, mysql_client, amg_rpc_proxy)

    interval = timedelta(hours=1)
    buf = 60 # 1 minute. added to interval, or used as timeout between retries

    try:
        while True:

            latest_poll = await mongo_db.polls.find_one({}, sort=[('date', pymongo.DESCENDING)])
            latest_poll = latest_poll and latest_poll.get('date')
            latest_sync = await mongo_db.sync_history.find_one({}, sort=[('date', pymongo.DESCENDING)])
            latest_sync = latest_sync and latest_sync.get('date')

            now = datetime.now()
            print(f'{latest_poll=}')
            print(f'{latest_sync=}')
            print(f'{now=}')
            duration = 0 if latest_poll is None or latest_sync is None or latest_sync < latest_poll or (d := (latest_poll + interval - now).total_seconds()) < 0 else d
            print(f'sleeping for {duration} seconds')
            await asyncio.sleep(duration)

            # update polls, wait for next poll update after interval
            while True:
                async with mysql_client.cursor() as mysql_cursor:
                    if latest_poll:
                        await mysql_cursor.execute('select StartTime from tam.polllog where StartTime > %s order by StartTime desc', (latest_poll,))
                    else:
                        await mysql_cursor.execute('select StartTime from tam.polllog order by StartTime desc')
                        
                    if mysql_cursor.rowcount:
                        polls = await mysql_cursor.fetchall()
                        # yuck
                        #polls = [date + timedelta(hours=5) for date, in polls]
                        polls = [date for date, in polls]
                        latest_poll = polls[0]
                        polls = [{'date': date} for date in polls]
                        await mongo_db.polls.insert_many(polls)

                    if latest_poll and (latest_sync is None or latest_poll > latest_sync):
                        break   

                # if no new poll, wait 1 minute, check for poll again
                print(f'sleeping for {buf} seconds')
                await asyncio.sleep(buf)

            now = datetime.now()
            min_date = min(get_sunday(now), get_sunday(latest_sync)) if latest_sync else get_sunday(now - timedelta(days=365))
            print('min_date', min_date);
            await update(mongo_db, amg_rpc_proxy, min_date, now)
            await mongo_db.sync_history.insert_one({'date': now});


    except asyncio.CancelledError:
        pass
    finally:
        print('cancelled')
        await amg_rpc_proxy.close()
        mysql_client.close()
        mongo_client.close()


async def update(mongo_db, proxy, min_date: datetime, now):
    # useful if encoding strange types
    type_registry = TypeRegistry(fallback_encoder=timedelta_encoder)
    codec_options = CodecOptions(type_registry=type_registry)
    shifts_col = mongo_db.get_collection('shifts', codec_options=codec_options)

    employee_ids = [int(empl['id']) for empl in await mongo_db.employees.find({}).to_list(1000)]

    async for group, max_date in update_shifts(proxy, employee_ids, min_date, now):
        for component in group:
            employee_id, start, end = [component[k] for k in ['employee', 'start', 'end']]

            if start is None:
                continue

            # existing component, perhaps it has been finished
            doc = await mongo_db.components.find_one({'employee': employee_id, 'start': start})
            if doc is None:
                result = await mongo_db.components.insert_one(component)
                component_id = result.inserted_id
            else:
                component_id = doc['_id']
                await mongo_db.components.update_one({'_id': component_id}, {'$set': component})
                shift_id = doc['shift']
                shift = await mongo_db.shifts.find_one_and_update({'_id': shift_id}, {'$set': {'end': end}})
                continue

            component['_id'] = component_id

            doc = await shifts_col.find_one({
                'employee': employee_id,
                'end': {'$lte': start, '$gt': start - timedelta(hours=4)}
                }, sort=[('end', -1)])

            duration = end - start if end is not None else timedelta()
            shift_state = 'incomplete' if end is None else 'complete'

            if doc is None:
                result = await shifts_col.insert_one({'employee': employee_id,
                    'components': [component_id], 'start': start, 'end': end,
                    'duration': duration, 'state': shift_state })
                await mongo_db.components.update_one({'_id': component_id}, {'$set': {'shift': result.inserted_id}})
            else:
                shift_id = doc['_id']
                if duration is not None:
                    duration += timedelta(microseconds=doc['duration'])
                else:
                    duration = timedelta()
                await shifts_col.update_one({'_id': shift_id}, {
                    '$push': {'components': component_id},
                    '$set': {
                        'end': end,
                        'state': shift_state,
                        'duration': duration,
                    }})
                await mongo_db.components.update_one({'_id': component_id}, {'$set': {'shift': shift_id}})


    values = []
    next_state = {}
    current_state = await mongo_db.state.find_one({}, sort=[('date', pymongo.DESCENDING)])

    value_ids = set()
    async for value in mongo_db.shifts.aggregate([
        {'$match': {'state': 'incomplete'}},
        {'$sort': {'start': -1}},
        {'$group': {'_id': '$employee', 'value': {'$first': '$$ROOT'}}},
        {'$replaceRoot': {'newRoot': '$value'}},
        {'$sort': {'start': -1}},
        ]):
        value_ids.add(value['_id'])
        values.append(value)

    async for value in mongo_db.state.aggregate([
        {'$sort': {'date': -1}},
        {'$limit': 1},
        {'$unwind': '$values'},
        {'$match': {'$expr': {'$eq': ['$values.end', None]}}}, # remove shifts that have ended
        {'$lookup': {'from': 'shifts', 'localField': 'values._id', 'foreignField': '_id', 'as': 'nextValues'}},
        {'$unwind': '$nextValues'},
        {'$replaceRoot': {'newRoot': '$nextValues'}},
        ]):
        if value['_id'] not in value_ids:
            values.append(value)

    await mongo_db.state.insert_one({'date': now, 'values': values})

    await recalculate(mongo_db, min_date)


async def update_shifts(proxy, employee_ids, min_date, end_date = datetime.now(), interval = timedelta(days=14)):
    offset = timedelta(hours=5)
    while min_date < end_date:
        max_date = min_date + interval
        logging.info(f'{min_date} - {max_date}')

        employee_timecards = await proxy.GetTimecards(employee_ids, min_date, max_date, False)
        now = datetime.now()
        group = []
        for each in employee_timecards:
            employee_id, timecards = str(each['EmployeeId']), each['Timecards']

            for item in timecards:
                punches = []
                obj = {'punches': punches, 'employee': employee_id}
                for k0, k1 in [('date', 'Date'), ('isManual', 'IsManual'), ('hours', 'Reg')]:
                    obj[k0] = item.get(k1)
                for k0, k1 in [('start', 'StartPunch'), ('end', 'StopPunch')]:
                    if (p := item.get(k1)):
                        obj[k0] = p['OriginalDate'] + offset
                        punches.append(p['Id'])
                    else:
                        obj[k0] = None
                # this breaks if start time was amended
                group.append(obj)

        yield group, max_date
        min_date = max_date


async def update_shift_stats(db):
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
    async for doc in db.shifts.aggregate(pipeline):
        pass


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


if __name__ == '__main__':
    config = configparser.ConfigParser()
    config.read('config.ini')

    logging.getLogger().setLevel(logging.INFO)
    logging.info('daemon starting up')
    sys.stdout.flush()
    try:
        asyncio.run(main(config))
    except KeyboardInterrupt:
        pass
    finally:
        logging.info('closing')

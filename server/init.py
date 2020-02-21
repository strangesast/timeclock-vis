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
import motor.motor_asyncio
from enum import Enum, IntEnum
from aioitertools import groupby, enumerate
from datetime import timedelta, datetime, timezone
from itertools import zip_longest, islice
import models

from util import get_async_rpc_connection, merge_nearby_shifts, parse_timecards_2, get_mysql_db, get_mongo_db


async def main():
    config_path = os.path.join(os.path.dirname(__file__), 'config.ini');
    if not os.path.isfile(config_path):
        raise RuntimeError('no config file found')
    config = configparser.ConfigParser()
    config.read(config_path)

    mysql_client = await get_mysql_db(config['MYSQL'])
    mongo_client = await get_mongo_db(config['MONGO'])

    proxy = get_async_rpc_connection(config['AMG'])


    cur = await mysql_client.cursor(aiomysql.DictCursor)
    await cur.execute('select id,Code,Name,MiddleName,LastName,HireDate from tam.inf_employee')

    employee_ids = [];
    employees = {}
    async for i, employee in enumerate(wrap_fetchone(cur)):
        color = models.EmployeeShiftColor(i % len(models.EmployeeShiftColor))
        employee_id = str(employee['id'])
        employee_ids.append(employee_id)
        employee['id'] = employee_id
        employee['Color'] = color
        employees[employee['id']] = employee;

    await mongo_client.timeclock.drop_collection('employees')
    await mongo_client.timeclock.employees.create_index('id', unique=True)
    result = await mongo_client.timeclock.employees.insert_many(employees.values())



    # check polllog
    cur = await mysql_client.cursor()
    await cur.execute('select StartTime,Messages from tam.polllog order by StartTime desc limit 1')
    row = await cur.fetchone()
    if row is None:
        raise Exception('no polls? somethings fucked');
    last_poll = row[0]

    doc = await mongo_client.timeclock.polls.find_one({}, sort=[('date', pymongo.DESCENDING)])
    if doc is None:
        await cur.execute('select StartTime from tam.polllog')
        polls = await cur.fetchall()
        polls = [{'date': date} for date, *_ in polls]
        print(len(polls))
        await mongo_client.timeclock.polls.insert_many(polls)
    elif last_poll > doc['date']:
        await cur.execute('select StartTime from tam.polllog where StartTime > %s', (doc['date'],))
        if cur.rowcount:
            polls = await cur.fetchall()
            polls = [{'date': date} for date, *_ in polls]
            print(len(polls))
            await mongo_client.timeclock.polls.insert_many(polls)

    print(f'Last poll {row[0]}')

    #cur = await mysql_client.cursor(aiomysql.DictCursor)
    #await cur.execute('select id,inf_employee_id,Date from tam.tr_clock order by inf_employee_id,Date asc')

    now = datetime.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    interval = timedelta(weeks=2)
    min_date = today - timedelta(days=365)
    min_date = min_date - timedelta(days=min_date.weekday() - 1)

    shifts = []
    while min_date < today:
        max_date = min_date + interval
        print(min_date, max_date)
        employee_timecards = await proxy.GetTimecards([int(s) for s in employee_ids], min_date, max_date, False)
        for each in employee_timecards:
            employee_id, timecards = each['EmployeeId'], each['Timecards']

            incomplete_shifts = []

            #for components in merge_nearby_shifts(parse_timecards(employee_id, timecards)):
            for components in parse_timecards_2(employee_id, timecards):
                start_date = components[0]['start']
                end_date = components[-1]['end']
                is_complete = end_date is not None
                shift_state = models.ShiftState.Complete if is_complete else models.ShiftState.Incomplete
                total_duration = timedelta()
                if is_complete:
                    for component in components:
                        total_duration += component['end'] - component['start']
                is_flagged = True if not is_complete and ((total_duration is not None and total_duration > timedelta(hours=24)) or (now - start_date) > timedelta(hours=24)) else False
                shift = {
                    'flagged': is_flagged,
                    'employee': str(employee_id),
                    'components': components,
                    'start': start_date,
                    'end': end_date,
                    'duration': total_duration,
                    'state': shift_state.value
                }
                if not is_complete:
                    incomplete_shifts.append(shift)
                shifts.append(shift)

            for shift in incomplete_shifts[:-1]:
                shift['flagged'] = True

        min_date = max_date

    await mongo_client.timeclock.drop_collection('shifts')
    type_registry = TypeRegistry(fallback_encoder=timedelta_encoder)
    codec_options = CodecOptions(type_registry=type_registry)
    collection = mongo_client.timeclock.get_collection('shifts', codec_options=codec_options)
    result = await collection.insert_many(shifts)


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

    async for doc in collection.aggregate(pipeline):
        pass


    await proxy.close()
    await cur.close()
    mongo_client.close()


"""
read polllog collection
if exists, get most recent poll
query for new polls
if not exists, query for whole set
"""

def timedelta_encoder(value):
    if isinstance(value, timedelta):
        return int(value.total_seconds() * 1000)
    return value


async def wrap_fetchone(cur: aiomysql.Cursor):
    while (item := await cur.fetchone()):
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
    asyncio.run(main())

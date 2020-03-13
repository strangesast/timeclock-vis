import asyncio
import motor.motor_asyncio
from bson.json_util import dumps

from pprint import pprint

VALID_EMPLOYEE_PIPELINE = [
  {'$group': {'_id': '$employee', 'count': {'$sum': 1}}},
  {'$match': {'count': {'$gte': 20}}},
  {'$project': {'id': '$_id', '_id': 0}},
]

PIPELINE = [
    # use only completed shifts
    {'$match': {'end': {'$ne': None}}},
    {'$addFields': {
        'startHour': {'$dateToParts': {'date': '$start', 'timezone': 'America/New_York'}},
        'endHour': {'$dateToParts': {'date': '$end', 'timezone': 'America/New_York'}},
        'dayOfWeek': {'$dayOfWeek': {'date': '$start', 'timezone': 'America/New_York'}},
    }},
    # calculate seconds in day from hour/minute/second
    {'$addFields': {
        'startHour': {'$sum': ['$startHour.second', {'$multiply': ['$startHour.minute', 60]}, {'$multiply': ['$startHour.hour', 3600]}]},
        'endHour': {'$sum': ['$endHour.second', {'$multiply': ['$endHour.minute', 60]}, {'$multiply': ['$endHour.hour', 3600]}]},
    }},
    # if overnight shift, fix
    {'$addFields': {
        'endHour': {'$cond': {'if': {'$gte': ['$startHour', '$endHour']}, 'then': {'$sum': ['$endHour', 8.64e4]}, 'else': '$endHour'}}
    }},
    # use hours instead of seconds
    {'$addFields': {
        'startHour': {'$divide': ['$startHour', 3600]},
        'endHour': {'$divide': ['$endHour', 3600]},
    }},
    # join with components
    {'$unwind': '$components'},
    {'$lookup': {
        'from': 'components',
        'localField': 'components',
        'foreignField': '_id',
        'as': 'components',
    }},
    {'$unwind': '$components'},
    {'$group': {
        '_id': '$_id',
        'root': {'$first': '$$ROOT'},
        'components': {'$push': '$components'},
    }},
    {'$addFields': {'root.components': '$components'}},
    {'$replaceRoot': {'newRoot': '$root'}},
    # recalculate cumulative duration from components
    {'$addFields': {'duration': {'$map': {'input': '$components', 'in': {'$subtract': ['$$this.end', '$$this.start']}}}}},
    {'$addFields': {'duration': {'$sum': '$duration'}}},
    # use hours instead of milliseconds
    {'$addFields': {'duration': {'$divide': ['$duration', 3.6e6]}}},
    {'$sort': {'start': 1}},
    {'$addFields': {
        'weekYear': {
            'week': {'$week': {'date': '$start', 'timezone': 'America/New_York'}},
            'year': {'$year': {'date': '$start', 'timezone': 'America/New_York'}},
        }
    }},
    # group by year & week
    {'$group': {
        '_id': {'employee': '$employee', 'week': '$weekYear'},
        'shifts': {'$push': '$$ROOT'},
    }},
    # break out totals duration each shift
    {'$addFields': {
        'shiftLengths': {'$map': {'input': '$shifts', 'in': '$$this.duration'}},
    }},
    # calculate running total hours
    {'$addFields': {
        'shiftWeekHours': {'$reduce': {
            'input': '$shiftLengths',
            'initialValue': [],
            'in': {'$concatArrays': ['$$value', [{'$sum': [{'$arrayElemAt': ['$$value', -1]}, '$$this']}]]}
            }}
    }},
    # offset counts to not include current shift
    {'$addFields': {
        'shiftWeekHours': {'$concatArrays': [[0], '$shiftWeekHours']},
    }},
    # replace number with object for later mergeObjects
    {'$addFields': {
        'shiftWeekHours': {'$map': {'input': '$shiftWeekHours', 'in': {'weekHours': '$$this'}}},
    }},
    # zip durations with shifts
    {'$addFields': {
        'shifts': {'$zip': {'inputs': ['$shifts', '$shiftWeekHours']}},
    }},
    {'$addFields': {
        'shifts': {'$map': {'input': '$shifts', 'in': {'$mergeObjects': [{'$arrayElemAt': ['$$this', 0]}, {'$arrayElemAt': ['$$this', 1]}]}}}
    }},
    {'$project': {'shifts': 1}},
    {'$unwind': '$shifts'},
    {'$replaceRoot': {'newRoot': '$shifts'}},
    {'$project': {'components': 0, 'state': 0, 'row': 0, 'weekYear': 0}},
]


async def main():
    host, port = 'localhost', 27017
    url = f'mongodb://{host}:{port}'
    conn = motor.motor_asyncio.AsyncIOMotorClient(url)
    db = conn.timeclock

    employee_ids = [doc['id'] for doc in await db.shifts.aggregate(VALID_EMPLOYEE_PIPELINE).to_list(None)]

    with open('data.json', 'w') as f:
        pipeline = [{'$match': {'employee': {'$in': employee_ids}}}, *PIPELINE]
        data = await db.shifts.aggregate(pipeline).to_list(None)
        f.write(dumps(data, sort_keys=True, indent=4))


if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
    loop.close()

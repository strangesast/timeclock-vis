import asyncio
import pymongo
import configparser
from pprint import pprint
from datetime import datetime

from util import get_mongo_db

async def graph(mongo_db):
    frac = 2
    # buckets of seconds
    buckets = [v * 60 / frac * 60 for v in range(48 * frac)]
    buckets = zip(buckets[0:-1], buckets[1:])
    buckets = [{'$cond': {'if': {'$and': [{'$lte': ['$start', b[0]]}, {'$gt': ['$end', b[1]]}]}, 'then': i, 'else': None}} for i, b in enumerate(buckets)]

    pipeline = [
        {'$match': {'end': {'$ne': None}}},
        {'$addFields': {
            'start': {'$dateToParts': {'date': '$start', 'timezone': 'America/New_York'}},
            'end': {'$dateToParts': {'date': '$end', 'timezone': 'America/New_York'}},
        }},
        {'$addFields': {
            'start': {'$sum': ['$start.second', {'$multiply': ['$start.minute', 60]}, {'$multiply': ['$start.hour', 3600]}]},
            'end': {'$sum': ['$end.second', {'$multiply': ['$end.minute', 60]}, {'$multiply': ['$end.hour', 3600]}]},
        }},
        {'$addFields': {
            'end': {'$cond': {'if': {'$gte': ['$start', '$end']}, 'then': {'$sum': ['$end', 8.64e4]}, 'else': '$end'}}
        }},
        {'$addFields': {'buckets': buckets}},
        {'$addFields': {'buckets': {'$filter': {'input': '$buckets', 'cond': {'$ne': ['$$this', None]}}}}},
        {'$unwind': '$buckets'},
        {'$group': {'_id': {'employee': '$employee', 'bucket': '$buckets'}, 'count': {'$sum': 1}}},
        {'$sort': {'_id.employee': 1, '_id.bucket': 1}},
        {'$group': {'_id': '$_id.employee', 'buckets': {'$push': {'bucket': '$_id.bucket', 'count': '$count'}}}},
    ]
    async for item in mongo_db.components.aggregate(pipeline):
        pprint(item)


async def main():
    config = configparser.ConfigParser()
    config.read('config.ini')
    mongo_client = await get_mongo_db(config['MONGO'])
    mongo_db = mongo_client.timeclock
    await graph(mongo_db)
    mongo_client.close()


if __name__ == '__main__':
    asyncio.run(main())

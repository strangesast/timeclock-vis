import asyncio
import pymongo
import configparser
from pprint import pprint
from datetime import datetime

from util import get_mongo_db

async def get_graph_data(mongo_db):
    frac = 2 # half hour
    # buckets of seconds
    l = 48 * frac
    buckets = [v * 60 / frac * 60 for v in range(l)]
    buckets = list(zip(buckets[0:-1], buckets[1:]))
    pairs = list(zip(map(str, range(0, l)), map(str, range(int(l/2), l))))
    buckets = [{'$cond': {'if': {'$and': [{'$lte': ['$start', b[0]]}, {'$gt': ['$end', b[1]]}]}, 'then': str(i % int(24 * frac)), 'else': None}}
            for i, b in enumerate(buckets)]
    pipeline = [
        {'$match': {'end': {'$ne': None}}},
        {'$facet': {
            'data': [
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
                {'$group': {
                    '_id': '$_id.bucket',
                    'buckets': {'$push': {'employee': '$_id.employee', 'count': '$count'}},
                    'total': {'$sum': '$count'},
                }},
                {'$sort': {'_id': 1}},
                {'$addFields': {'buckets': {'$map': {'input': '$buckets', 'in': ['$$this.employee', '$$this.count']}}}},
                {'$addFields': {'buckets': {'$arrayToObject': '$buckets'}}},
            ],
            'employees': [
                {'$group': {'_id': '$employee'}},
                {'$lookup': {'from': 'employees', 'localField': '_id', 'foreignField': 'id', 'as': 'employee'}},
                {'$unwind': '$employee'},
                {'$replaceRoot': {'newRoot': '$employee'}},
            ],
        }}
    ]
    data = await mongo_db.components.aggregate(pipeline).to_list(1)
    columns = list(map(str, range(24 * frac)))
    return {'columns': columns, **data[0]}


async def main():
    config = configparser.ConfigParser()
    config.read('config.ini')
    mongo_client = await get_mongo_db(config['MONGO'])
    mongo_db = mongo_client.timeclock
    res = await get_graph_data(mongo_db)
    pprint(res)
    mongo_client.close()


if __name__ == '__main__':
    asyncio.run(main())

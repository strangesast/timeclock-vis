import asyncio
import pymongo
import configparser
from pprint import pprint
from datetime import datetime

from util import get_mongo_db

async def main():
    config = configparser.ConfigParser()
    config.read('config.ini')
    mongo_client = await get_mongo_db(config['MONGO'])
    mongo_db = mongo_client.timeclock

    rows = []
    now = datetime.now()
    pipeline = [
        {'$unwind': {'path': '$components', 'preserveNullAndEmptyArrays': True}},
        {'$lookup': {'from': 'components', 'localField': 'components', 'foreignField': '_id', 'as': 'components'}},
        {'$unwind': {'path': '$components', 'preserveNullAndEmptyArrays': True}},
        {'$addFields': {'components.duration': {'$subtract': [{'$ifNull': ['$components.end', '$$NOW']}, '$components.start']}}},
        {'$group': {'_id': '$_id', 'components': {'$push': '$components'}, 'root': {'$first': '$$ROOT'}}},
        {'$addFields': {'root.components': '$components'}},
        {'$replaceRoot': {'newRoot': '$root'}},
        {'$addFields': {'duration': {'$map': {'input': '$components', 'as': 'comp', 'in': '$$comp.duration'}}}},
        {'$addFields': {'duration': {'$sum': '$duration'}, 'end': {'$ifNull': ['$end', '$$NOW']}}},
        {'$sort': {'start': 1}},
        {'$match': {'duration': {'$lt': 16 * 60 * 60 * 1000}}},
    ]
    async for shift in mongo_db.shifts.aggregate(pipeline):
        for row in range(30):
            if row > len(rows) - 1:
                rows.append(shift['end'] or now)
                break
            elif rows[row] < shift['start']:
                rows[row] = shift['end'] or now
                break

        await  mongo_db.shifts.update_one({'_id': shift['_id']}, {'$set': {'row': row}})

    pprint(rows)
    print(len(rows))
    mongo_client.close()


if __name__ == '__main__':
    asyncio.run(main())

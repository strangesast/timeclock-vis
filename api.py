# connect to mongo
# provide current / historical object info
# /shifts, /employees
# gunicorn?
import pymongo
import configparser
from aiohttp import web
from datetime import datetime
from bson.json_util import dumps
from aiojobs.aiohttp import setup, spawn

from util import get_mongo_db

EMPLOYEE_IDS = ['50', '53', '71', '61', '82', '73', '55', '72', '66', '62', '69',
        '67', '80', '79', '57', '51', '70', '74', '54', '56', '58', '59', '64', '65']

routes = web.RouteTableDef()

async def coro():
    print('sleeping...')
    await asyncio.sleep(2)
    print('done sleeping')


@routes.get('/recheck')
async def recheck(request):
    await spawn(request, coro())
    return web.Response(text='checking')


@routes.get('/data/shifts')
async def get_shifts(request):
    q = parse_qs(request.query)

    min_date, max_date = q.get('minDate'), q.get('maxDate')
    limit = 2000

    db = request.app['db'].timeclock;

    if max_date is None and min_date is None:
        query = {}
    elif min_date is None:
        query = {'start': {'$lt': max_date}}
    elif max_date is None:
        query = {'$or': [{'start': {'$gt': min_date}, 'end': None}, {'end': {'$gt': min_date}}]}
    else: 
        query = {
            '$or': [
                {'start': {'$gt': min_date, '$lt': max_date}},
                {'$and': [{'end': None}, {'start': {'$lt': max_date}}]},
                {'end': {'$gt': min_date, '$lt': max_date}},
                {'$and': [{'start': {'$lt': min_date}}, {'end': {'$gt': max_date}}]},
            ],
        }

    # uggglyy
    #query['flagged'] = False

    if employee_id := q.get('employee'):
        employee = await db.employees.find_one({'id': employee_id})
        if employee is None:
            return web.HTTPNotFound(body=f'no employee with id: "{employee_id}"')
        query['employee'] = employee_id
        employees = {employee_id: employee}
    else:
        employees = await db.employees.find({}).to_list(100)
        employees = {id: employee for employee in employees if (id := employee.get('id'))}

    print(f'{query=}')
    # ayy join
    shifts = []
    async for shift in db.shifts.aggregate([
        {'$match': query},
        {'$unwind': '$components'},
        {'$lookup': {'from': 'components', 'localField': 'components', 'foreignField': '_id', 'as': 'components'}},
        {'$unwind': {'path': '$components', 'preserveNullAndEmptyArrays': True}},
        {'$group': {'_id': '$_id', 'components': {'$push': '$$ROOT.components'}, 'root': {'$first': '$$ROOT'}}},
        {'$addFields': {'root.components': '$components'}},
        {'$replaceRoot': {'newRoot': '$root'}}
        ]):
        shifts.append(shift)

    return web.Response(text=dumps({
        'employees': employees,
        'employeeIds': [employee_id] if employee_id is not None else EMPLOYEE_IDS,
        'shifts': shifts,
    }))


def parse_qs(query):
    result = {}
    for key in ['minDate', 'maxDate']:
        if key in query:
            try:
                result[key] = datetime.fromisoformat(query[key].replace('Z', '+00:00'))
            except ValueError:
                pass
    if 'employee' in query:
        try:
            int(query['employee'])
            result['employee'] = query['employee']
        except ValueError:
            pass

    return result


async def main():
    config = configparser.ConfigParser()
    config.read('config.ini')
    app = web.Application()
    app.add_routes(routes)
    app['db'] = await get_mongo_db(config['MONGO'])
    setup(app)
    return app


if __name__ == '__main__':
    web.run_app(main(), host='0.0.0.0', port=8081)

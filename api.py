# connect to mongo
# provide current / historical object info
# /shifts, /employees
# gunicorn?
# api.py
import os
import json
import asyncio
import weakref
import pymongo
import configparser
from pprint import pprint
import motor.motor_asyncio
from functools import reduce
from bson.json_util import dumps
from aiohttp import web, WSCloseCode
from datetime import datetime, date, timedelta, timezone
from util import get_async_rpc_connection, parse_timecards, merge_nearby_shifts, get_mongo_db

from init import init
import models

routes = web.RouteTableDef()
EMPLOYEE_IDS = ['50', '53', '71', '61', '82', '73', '55', '72', '66', '62', '69', '67', '80', '79', '57', '51', '70', '74', '54', '56', '58', '59', '64', '65']


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
    query['flagged'] = False

    if employee_id := q.get('employee'):
        employee = await db.employees.find_one({'id': employee_id})
        if employee is None:
            return web.HTTPNotFound(body=f'no employee with id: "{employee_id}"')
        query['employee'] = employee_id
        employees = {employee_id: employee}
    else:
        employees = await db.employees.find({}).to_list(100)
        employees = {id: employee for employee in employees if (id := employee.get('id'))}

    pprint(query)
    shifts = await db.shifts.find(query).sort([('start', pymongo.ASCENDING)]).limit(limit).to_list(limit)

    return json_response({
        'employees': employees,
        'employeeIds': [employee_id] if employee_id is not None else EMPLOYEE_IDS,
        'shifts': shifts,
    });


def json_response(d):
    return web.Response(text=dumps(d, default=default))


def default(o):
    if isinstance(o, datetime):
        return o.isoformat()
    if isinstance(o, timedelta):
        return int(o.total_seconds() * 1000)

def utc_to_local(dt: datetime):
    return dt.replace(tzinfo=timezone.utc).astimezone(tz=None)


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


async def background(app):
    try:
        while True:
            # check db
            changes = False
            state = {}
            if changes:
                for ws in set(app['websockets']):
                    await ws.send_str(json.dumps(state, default=default))
            await asyncio.sleep(1000)
    except asyncio.CancelledError:
        pass
    finally:
        pass


async def on_shutdown(app):
    await app['background'].cancel()
    for ws in set(app['websockets']):
        await ws.close(code=WSCloseCode.GOING_AWAY,
                       message='Server shutdown')
    #await app['proxy'].close()
    app['db'].close()


async def on_startup(app):
    app['background'] = asyncio.create_task(background(app))
    #app['proxy'] = get_async_rpc_connection(config['AMG'])


async def main():
    configpath = os.path.join(os.path.dirname(__file__), 'config.ini')
    if not os.path.isfile(configpath):
        raise RuntimeError('no config file found')
    config = configparser.ConfigParser()
    config.read(configpath)

    app = web.Application()
    app['websockets'] = weakref.WeakSet()

    app.add_routes(routes)
    app['db'] = await get_mongo_db(config['MONGO'])
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    return app


if __name__ == '__main__':
    web.run_app(main())

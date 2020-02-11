import json
import asyncio
import weakref
import pymongo
from datetime import datetime
import motor.motor_asyncio
from bson.json_util import dumps
from aiohttp import web, WSCloseCode

routes = web.RouteTableDef()

@routes.get('/data/shifts')
async def index(request):
    req_q = request.query
    # limit response count?
    # "after" some id
    # "minDate", "maxDate"
    query = {}

    if 'minDate' in req_q and 'maxDate' in req_q:
        try:
            minDate, maxDate = req_q['minDate'], req_q['maxDate']
            minDate, maxDate = map(lambda s: s.replace('Z', '+00:00'), [minDate, maxDate])
            minDate, maxDate = map(datetime.fromisoformat, [minDate, maxDate])
        except ValueError as e:
            return web.HTTPBadRequest(body='invalid date')

        query = {'$or': [
            {'start': {'$gt': minDate, '$lt': maxDate}},
            {'start': {'$gt': minDate}, 'end': None},
            {'end':   {'$gt': minDate, '$lt': maxDate}},
            {'start': {'$lt': minDate}, 'end': {'$gt': maxDate}},
        ]}

    if 'employee' in req_q:
        try:
            employee_id = req_q['employee']
            employee_id = int(employee_id)
            employee_id = str(employee_id)
        except ValueError as e:
            return web.HTTPBadRequest(body='invalid employee id')
        query['employee'] = employee_id

    print(query)

        
    cursor = request.app['db'].timeclock.shifts.find(query, {"_id": 0}).sort('_id', pymongo.ASCENDING)
    shifts = await cursor.to_list(None)

    employee_ids = list(set(s['employee'] for s in shifts))

    cursor = request.app['db'].timeclock.employees.find({'id': {'$in': employee_ids}}, {"_id": 0})
    employees = await cursor.to_list(None)

    return json_response({'shifts': shifts, 'employeeIds': employee_ids, 'employees': employees})
    # need encoder
    #return web.json_response({'shifts': shifts})

def json_response(d):
    return web.Response(text=json.dumps(d, default=default))


def default(o):
    if isinstance(o, datetime):
        return o.isoformat()


async def on_shutdown(app):
    for ws in set(app['websockets']):
        await ws.close(code=WSCloseCode.GOING_AWAY,
                       message='Server shutdown')
    app['db'].close()


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


async def main():
    app = web.Application()
    app['websockets'] = weakref.WeakSet()
    HOST = '192.168.86.11'
    app['db'] = motor.motor_asyncio.AsyncIOMotorClient(f'mongodb://user:password@{HOST}:27017')
    app.add_routes(routes)
    app.on_shutdown.append(on_shutdown)

    runner = web.AppRunner(app)
    await runner.setup()

    host = '0.0.0.0'
    port = '8080'
    site = web.TCPSite(runner, host, port)
    await site.start()

    try:
        await asyncio.create_task(background(app))
    finally:
        print('shutting down')
        await runner.cleanup()


if __name__ == '__main__':
    asyncio.run(main())

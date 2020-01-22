import os
import json
import asyncio
import pathlib
import weakref
import configparser
import xmlrpc.client
import logging
from pprint import pprint
from contextvars import ContextVar
from aiohttp_xmlrpc.client import ServerProxy
from aiohttp import web, WSCloseCode
from datetime import datetime, date, timedelta

from util import get_async_rpc_connection, parse_timecards


# how often is timeclock polled by PC (set on PC)
POLL_INTERVAL = timedelta(minutes=60)

# how long does the polling take to make it into system
POLL_PADDING = timedelta(minutes=1)

# how often should refresh be attempted if past POLL_INTERVAL
POLL_RETRY_INTERVAL = timedelta(minutes=1)

last_state = {}

routes = web.RouteTableDef()

if os.environ.get('env') != 'production': 
    @routes.get('/')
    async def index(request):
        return web.FileResponse('./index.html')
    
    @routes.get('/manifest.json')
    async def index(request):
        return web.FileResponse('../manifest.json')


@routes.get('/socket')
async def websocket_handler(request):

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    request.app['websockets'].add(ws)

    print('new client')
    s = json.dumps(last_state, default=default)
    await ws.send_str(s)

    try:
        async for msg in ws:
            print(f'{msg=}')
    finally:
        request.app['websockets'].discard(ws)

    print('websocket connection closed')
    return ws


def default(o):
    if isinstance(o, datetime):
        return o.isoformat()


async def get_last_poll_time(proxy: ServerProxy, device_name='Handpunch') -> datetime:
    devices = await proxy.GetDevices([])
    device = next(device for device in devices if device_name in device.get('Name', ''))
    return device['LastPollTime']


async def get_shifts(proxy: ServerProxy, end_date = datetime.now() + timedelta(days=1), start_date = datetime.now() - timedelta(days=2)):
    employees_list = await proxy.GetAllEmployeesShort()
    employee_ids = [empl['Id'] for empl in employees_list]
    employees = dict(zip(employee_ids, employees_list))
    employee_timecards = await proxy.GetTimecards(employee_ids, start_date, end_date, False)

    shifts = []
    included_employees = {}
    for each in employee_timecards:
        employee_id = each['EmployeeId']
        employee_shifts = parse_timecards(employee_id, each['Timecards'])
        if len(employee_shifts):
            employee = employees[employee_id]
            included_employees[employee_id] = employee
        shifts.extend(employee_shifts)
    return shifts, employees, included_employees


async def check_timeclock(app):
    global last_state
    try:
        state = last_state
        last_poll_time = None
        new_state = {}

        while True:
            print('checking...')
            next_poll_time = await get_last_poll_time(app['proxy'])
            print(f'{next_poll_time}')
            # on first loop and when last_poll_time changes
            if last_poll_time is None or last_poll_time != next_poll_time:
                shifts, employees, employee_ids = await get_shifts(app['proxy'])
                new_state = {'shifts': shifts, 'employees': employees, 'employeeIds': employee_ids}
                last_poll_time = next_poll_time

            now = datetime.now()
            diff = last_poll_time + POLL_INTERVAL + POLL_PADDING - now
            # if last poll + interval (+ padding) has already passed, retry later
            if diff < timedelta(0):
                diff = POLL_RETRY_INTERVAL
            new_state['lastPoll'] = last_poll_time
            new_state['nextPoll'] = last_poll_time + POLL_INTERVAL
            new_state['nextRetry'] = now + diff;
            state = {**state, **new_state}
            last_state = state
            print('sending...')
            pprint(state)
            for ws in app['websockets']:
                await ws.send_str(json.dumps(state, default=default))
            await asyncio.sleep(diff.total_seconds())

    except asyncio.CancelledError:
        pass

    except Exception as e:
        print(e)
        print(f'encountered error: {e}')
        raise e

    finally:
        pass


async def start_background_tasks(app):
    app['timeclock_listener'] = asyncio.create_task(check_timeclock(app))


async def cleanup_background_tasks(app):
    app['timeclock_listener'].cancel()
    await app['timeclock_listener']


async def on_shutdown(app):
    for ws in set(app['websockets']):
        await ws.close(code=WSCloseCode.GOING_AWAY,
                       message='Server shutdown')
    await app['proxy'].close()


async def main(config):
    app = web.Application()
    app['websockets'] = weakref.WeakSet()

    print('got xmlrpc connection')

    app['proxy'] = get_async_rpc_connection(
        os.environ.get('AMG_HOST') or config['AMG'].get('HOST'),
        os.environ.get('AMG_PORT') or config['AMG'].get('PORT'),
        os.environ.get('AMG_PASSWORD') or config['AMG'].get('PASSWORD'),
        os.environ.get('AMG_USERNAME') or config['AMG'].get('USERNAME'))

    app.add_routes(routes)
    if os.environ.get('env') != 'production': 
        app.add_routes([web.static('/icons/', '../icons')])

    app.on_shutdown.append(on_shutdown)

    host, port = os.environ.get('SERVER_HOST', '0.0.0.0'), os.environ.get('SERVER_PORT', 8080)

    runner = web.AppRunner(app)
    await runner.setup()

    print(f'starting at {host}:{port}')
    site = web.TCPSite(runner, host, port)
    await site.start()

    try:
        await asyncio.create_task(check_timeclock(app))
    finally:
        print(f'shutting down')
        await runner.cleanup()


if __name__ == '__main__':
    if not os.path.isfile('config.ini'):
        raise RuntimeError('no config file found')
    config = configparser.ConfigParser()
    config.read('config.ini')
    asyncio.run(main(config))

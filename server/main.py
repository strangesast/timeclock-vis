import json
import asyncio
import pathlib
import weakref
import configparser
import xmlrpc.client
from contextvars import ContextVar
from pprint import pprint
from aiohttp import web, WSCloseCode
from datetime import datetime, date, timedelta


# how often is timeclock polled by PC (set on PC)
POLL_INTERVAL = timedelta(minutes=15)

# how long does the polling take to make it into system
POLL_PADDING = timedelta(minutes=3)

# how often should refresh be attempted if past POLL_INTERVAL
POLL_RETRY_INTERVAL = timedelta(minutes=5)

PROXY = ContextVar('proxy')

routes = web.RouteTableDef()


@routes.get('/')
async def index(request):
    return web.FileResponse('./index.html')


@routes.get('/socket')
async def websocket_handler(request):

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    request.app['websockets'].add(ws)

    s = json.dumps(request.app['last-state'], default=default)
    await ws.send_str(s)

    try:
        async for msg in ws:
            print(msg)
    finally:
        request.app['websockets'].discard(ws)

    print('websocket connection closed')
    return ws


def get_rpc_connection(host='localhost', port=3003, password='password', username='admin'):
    uri = f'http://{username}:{password}@{host}:{port}/API/Timecard.ashx'
    return xmlrpc.client.ServerProxy(uri, use_datetime=True)


def default(o):
    if isinstance(o, datetime):
        return o.isoformat()


def get_last_poll_time(proxy: xmlrpc.client, device_name='Handpunch') -> datetime:
    devices = proxy.GetDevices([])
    device = next(device for device in devices if device_name in device.get('Name', ''))
    return device['LastPollTime']


def merge_dups(arr):
    ''' arr is pairs of clock in, clock out
        combine sequential pairs with same clock out, clock in
    '''
    # if empty, return empty
    if not arr: return
    # start off with first pair
    aa, ab = arr[0]
    for ba, bb in arr[1:]:
        # if pair A end is pair B start
        if ba == ab:
            # set pair A end to pair B end
            ab = bb
        else:
            # else pair A is unique so move on
            yield (aa, ab)
            # set pair B as pair A
            aa, ab = ba, bb
    yield (aa, ab)


def get_shifts(proxy, end_date = datetime.now() + timedelta(days=1), start_date = datetime.now() - timedelta(days=2)):
    employees_list = proxy.GetAllEmployeesShort()
    employee_ids = [empl['Id'] for empl in employees_list]
    employees = dict(zip(employee_ids, employees_list))
    employee_timecards = proxy.GetTimecards(employee_ids, start_date, end_date, False)

    shifts = []
    included_employees = {}
    for each in employee_timecards:
        employee_id = each['EmployeeId']
        timecards = each['Timecards']
        timecards = [[punch['OriginalDate'] if (punch := timecard.get(key)) else None for key in ('StartPunch', 'StopPunch')]
                for timecard in timecards]
        timecards = list(merge_dups(timecards))
        if len(timecards):
            employee = employees[employee_id]
            included_employees[employee_id] = employee
        for start, end in timecards:
            shift = {
                    'EmployeeId': employee_id,
                    'Id': f'{employee_id}_{start.timestamp():.0f}',
                    'StartDate': start,
                    'EndDate': end
                    }
            shifts.append(shift)
    return shifts, employees, included_employees


async def check_timeclock(app):
    try:
        proxy = PROXY.get()
        state = app['last-state']
        new_state = {}

        while True:
            next_poll_time = get_last_poll_time(proxy)
            # on first loop and when last_poll_time changes
            if last_poll_time is None or last_poll_time != next_poll_time:
                shifts, employees, employee_ids = get_shifts(proxy)
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
            app['last-state'] = state
            for ws in app['websockets']:
                await ws.send_str(json.dumps(state, default=default))
            await asyncio.sleep(diff.total_seconds())

    except asyncio.CancelledError:
        pass

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

async def main():
    app = web.Application()
    app['websockets'] = weakref.WeakSet()
    app['last'] = None
    app.add_routes(routes)
    app.add_routes([web.static('/node_modules/', '../node_modules/')])
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)
    app.on_shutdown.append(on_shutdown)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8080)
    await site.start()

    await asyncio.sleep(10000)

    await runner.cleanup()


if __name__ == '__main__':
    config = configparser.ConfigParser()
    config.read('config.ini')

    PROXY.set(get_rpc_connection(
        config['AMG'].get('HOST'),
        config['AMG'].get('PORT'),
        config['AMG'].get('PASSWORD'),
        config['AMG'].get('USERNAME'),
    ))

    asyncio.run(main())

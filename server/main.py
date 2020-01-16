import json
import asyncio
import pathlib
import weakref
import configparser
import xmlrpc.client
from pprint import pprint
from aiohttp import web, WSCloseCode
from datetime import datetime, date, timedelta


# how often is timeclock polled by PC (set on PC)
POLL_INTERVAL = timedelta(minutes=15)

# how long does the polling take to make it into system
POLL_PADDING = timedelta(minutes=3)

# how often should refresh be attempted if past POLL_INTERVAL
POLL_RETRY_INTERVAL = timedelta(minutes=5)

routes = web.RouteTableDef()


@routes.get('/')
async def index(request):
    return web.FileResponse('./index.html')


@routes.get('/socket')
async def websocket_handler(request):

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    request.app['websockets'].add(ws)
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


def get_last_poll_time(proxy: xmlrpc.client, device_name='Handpunch'): datetime:
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
    return shifts, included_employees


async def check_timeclock(app):
    try:
        last = None

        while True:
            n = get_last_poll_time(proxy)
            if last is None or last != n:
                shifts, employees = get_shifts()
                s = json.dumps({'shifts': shifts, 'employees': employees})
                for ws in app['websockets']:
                    await ws.send_str(s)
                last = n
            diff = last + POLL_INTERVAL + POLL_PADDING - now
            if diff < 0:
                diff = POLL_RETRY_INTERVAL

            await asyncio.sleep(diff.seconds())

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

    amg_config = config['AMG']

    proxy = get_rpc_connection(
        amg_config.get('HOST'),
        amg_config.get('PORT'),
        amg_config.get('PASSWORD'),
        amg_config.get('USERNAME'),
    )

    # get state
    # timeout for time
    #  if last poll time within interval
    #t = get_last_poll_time(proxy)
    #print(t)

    #shifts, included_employees = get_shifts(proxy)

    #with open('shifts.json', 'w') as f:
    #    json.dump(shifts, f, indent=2, default=default)

    asyncio.run(main())

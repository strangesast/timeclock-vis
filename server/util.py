import os
import motor
import asyncio
import aiomysql
import xmlrpc.client
from datetime import timedelta
from aiohttp_xmlrpc.client import ServerProxy


async def get_mysql_db(config):
    '''
    connect to mysql/mariadb database
    '''
    host, port, user, password, db = [config.get(k) for k in ['host', 'port', 'user', 'password', 'db']]
    port = int(port)
    conn = await aiomysql.connect(host=host, port=port, user=user, password=password)
    return conn


async def get_mongo_db(config):
    '''
    connect to mongodb, check connection
    '''
    host, port, user, password = [config.get(s) for s in ['host', 'port', 'user', 'password']]
    url = f'mongodb://{user}:{password}@{host}:{port}'
    conn = motor.motor_asyncio.AsyncIOMotorClient(url)

    try:
        await conn.admin.command('ismaster')
    except ConnectionFailure as e:
        raise Exception(f'failed to connect to mongo at "{url}"')

    return conn


def get_async_rpc_connection(config):
    host, port, username, password = [os.environ.get(f'amg_{k}'.upper()) or config.get(k)
            for k in ['host', 'port', 'username', 'password']]
    loop = asyncio.get_running_loop()
    uri = f'http://{username}:{password}@{host}:{port}/API/Timecard.ashx'
    return ServerProxy(uri, loop=loop)


def get_rpc_connection(host='localhost', port=3003, password='password', username='admin'):
    uri = f'http://{username}:{password}@{host}:{port}/API/Timecard.ashx'
    return xmlrpc.client.ServerProxy(uri, use_datetime=True)


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


def merge_nearby_shifts(it, threshold=timedelta(hours=4)):
    last_end = None
    components = []
    for shift in it:
        start_date, end_date = shift
        if last_end is not None and start_date - last_end < threshold:
            components.append(shift)
        else:
            if len(components):
                yield components

            components = [shift]

        last_end = end_date

    if len(components):
        yield components



def parse_timecards(employee_id, timecards):
    shifts = []
    timecards = [[punch['OriginalDate'] if (punch := timecard.get(key)) else None for key in ('StartPunch', 'StopPunch')]
            for timecard in timecards]
    timecards = merge_dups(timecards)
    # not sure why start would be None
    shifts = [(start, end) for start, end in timecards if start is not None]

    return shifts

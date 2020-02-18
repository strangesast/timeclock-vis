import xmlrpc.client
import asyncio
from aiohttp_xmlrpc.client import ServerProxy


def get_async_rpc_connection(host='localhost', port=3003, password='password', username='admin'):
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


def parse_timecards(employee_id, timecards):
    shifts = []
    timecards = [[punch['OriginalDate'] if (punch := timecard.get(key)) else None for key in ('StartPunch', 'StopPunch')]
            for timecard in timecards]
    timecards = merge_dups(timecards)
    # not sure why start would be None
    shifts = [(start, end) for start, end in timecards if start is not None]

    return shifts

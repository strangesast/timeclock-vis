import xmlrpc.client

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
    timecards = list(merge_dups(timecards))
    for start, end in timecards:
        if start is None:
            print('fucked')
            continue
        shift = {
                'EmployeeId': employee_id,
                'Id': f'{employee_id}_{start.timestamp():.0f}',
                'StartDate': start,
                'EndDate': end
                }
        shifts.append(shift)

    return shifts

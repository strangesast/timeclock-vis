import asyncio
import aiomysql
from pprint import pprint
import motor.motor_asyncio
from enum import Enum, IntEnum
from aioitertools import groupby, enumerate
from datetime import timedelta, datetime
from itertools import zip_longest, islice


class EmployeeShiftColor(IntEnum):
    BLUE = 0
    GREEN = 1
    RED = 2
    ORANGE = 3
    PINK = 4


class ShiftState(str, Enum):
    Complete = 'complete'
    Incomplete = 'incomplete'


class ShiftComponentType(str, Enum):
    Actual = 'actual'
    Projected = 'projected'


async def main():
    HOST = '192.168.86.35'
    mongo_client = motor.motor_asyncio.AsyncIOMotorClient(f'mongodb://user:password@{HOST}:27017')

    args = {
        'host': HOST,
        'user': 'root',
        'password': 'password',
        'db': 'tam',
        'port': 3306,
    }
    mysql_conn = await aiomysql.connect(**args)

    cur = await mysql_conn.cursor(aiomysql.DictCursor)
    await cur.execute('select id,Code,Name,MiddleName,LastName,HireDate from tam.inf_employee')

    employees = {}
    async for i, employee in enumerate(wrap_fetchone(cur)):
        color = EmployeeShiftColor(i % len(EmployeeShiftColor))
        employee['id'] = str(employee['id'])
        employee['Color'] = color
        employees[employee['id']] = employee;

    await mongo_client.timeclock.drop_collection('employees')
    #await mongo_client.timeclock.employees.create_index('id', unique=True)
    result = await mongo_client.timeclock.employees.insert_many(employees.values())

    # get list of employees
      # merge into mongo

    # check polllog
    cur = await mysql_conn.cursor()
    await cur.execute('select StartTime,Messages from tam.polllog order by StartTime desc limit 1')
    row = await cur.fetchone()
    if row is not None:
        print(f'Last poll {row[0]}')

    cur = await mysql_conn.cursor(aiomysql.DictCursor)
    await cur.execute('select id,inf_employee_id,Date from tam.tr_clock order by inf_employee_id,Date asc')

    async def g():
        while (row := await cur.fetchone()):
            yield row

    last_shift_id = 0
    shifts = []
    async for employeeId, it in groupby(g(), key=lambda d: d['inf_employee_id']):
        employeeId = str(employeeId)
        employee = employees[employeeId]
        for seq in seq_grouper(grouper(map(lambda d: d and d['Date'], it))):
            components = []
            cum_duration = 0
            for start, end in seq:
                if end is None:
                    state = ShiftState.Incomplete
                    duration = None
                else:
                    state = ShiftState.Complete
                    duration = int((end - start).total_seconds() * 1000)
                    cum_duration += duration
                component = {'start': start, 'end': end, 'duration': duration, 'state': state, 'color': employee['Color'].value}
                components.append(component)
            shift = {
                'id': str(++last_shift_id),
                'employee': employeeId,
                'components': components,
                'duration': cum_duration,
                'started': True if len(components) else False,
                'start': components[0]['start'] if len(components) else None,
                'end': components[-1]['end'] if len(components) else None,
                }
            shifts.append(shift)

    await mongo_client.timeclock.drop_collection('shifts')
    #await mongo_client.timeclock.shifts.create_index('id', unique=True)
    result = await mongo_client.timeclock.shifts.insert_many(shifts)


    # check tr_clock
      # identify missed punches
      # get shifts blocks per day
      # identify patterns

    await cur.close()
    mongo_client.close()


async def wrap_fetchone(cur: aiomysql.Cursor):
    while (item := await cur.fetchone()):
        yield item


def seq_grouper(it, max_diff=timedelta(hours=4)):
    last_end = None
    items = []
    for pair in it:
        start, end = pair
        if last_end is None or (start - last_end) < max_diff:
            items.append(pair)
        elif len(items):
            yield items
            items = [pair]
        last_end = end

    if len(items):
        yield items


def grouper(iterable, n=2, fillvalue=None):
    args = [iter(iterable)] * n
    return zip_longest(*args, fillvalue=fillvalue)


if __name__ == '__main__':
    asyncio.run(main())

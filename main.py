import json
import asyncio
import aiomysql
from itertools import tee, zip_longest
from aioitertools import groupby
from datetime import datetime
from pprint import pprint

EMPLOYEE_COLS = ['id', 'Code', 'Name', 'MiddleName', 'LastName', 'HireDate']

async def get_employees(conn):
    async with conn.cursor(aiomysql.DictCursor) as cur:
        await cur.execute('select id,Code,Name,MiddleName,LastName,HireDate from inf_employee;');
        for row in await cur.fetchall():
            yield row


def converter(o):
    if isinstance(o, datetime):
        return o.isoformat()


async def main():
    pool = await aiomysql.create_pool(host='127.0.0.1', user='root',
            password='toast', db='tam', port=3306)

    async with pool.acquire() as conn:
        employees = {}
        async for o in get_employees(conn):
            employees[o['id']] = o
        with open('./data/employees.json', 'w', encoding='utf-8') as f:
            json.dump(employees, f, ensure_ascii=False, indent=2, default = converter)
        
        #async with conn.cursor(aiomysql.DictCursor) as cur:
        #    await cur.execute('select id,ClockDate,Date,InsertDate,inf_employee_id from tr_clock order by inf_employee_id,ClockDate');
        #    last = None
        #    row = await cur.fetchone()

        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute('''
                SELECT id,
                       ClockDate,
                       InsertDate,
                       Date,
                       inf_employee_id,
                       (
                         CASE inf_employee_id
                         WHEN @curId
                         THEN @curRow := @curRow + 1
                         ELSE @curRow := 1 AND @curId := inf_employee_id END
                       ) + 1 AS rank
                FROM tr_clock p,
                (SELECT @curRow := 0, @curId := '') r
                ORDER BY inf_employee_id,Date asc
            ''');

            async def it():
                while (val := await cur.fetchone()):
                    yield val

            shifts = [];
            last_shift_id = 0;
            async for inf_employee_id, i in groupby(it(), key=lambda o: o['inf_employee_id']):
                for pair in grouper(i):
                    a, b = pair
                    if a['Date'] is None:
                        print(a)
                    last_shift_id += 1
                    shift = {
                            'id': last_shift_id,
                            'employee': inf_employee_id,
                            'start': a['Date'],
                            'end': b and b['Date']
                            }
                    shifts.append(shift)

            with open('./data/shifts.json', 'w', encoding='utf-8') as f:
                json.dump(shifts, f, ensure_ascii=False, indent=2, default = converter)


        #async with conn.cursor(aiomysql.DictCursor) as cur:
        async with conn.cursor() as cur:
            await cur.execute('''
                SELECT id,
                       ClockDate,
                       InsertDate,
                       Date,
                       inf_employee_id,
                       DENSE_RANK() OVER (PARTITION BY inf_employee_id ORDER BY ClockDate) AS r
                FROM tr_clock
                ORDER BY inf_employee_id, ClockDate;
            ''');
            # WHERE inf_employee_id = 80
            last = None
            headers = [a for (a, *_) in cur.description]
            #p([*headers, 'Name'])
            #for _ in range(200):

            #pprint([a for (a,*_) in cur.description])
            #row = await cur.fetchone()
            #pprint(row)

            #row = await cur.fetchone()
            #pprint(row)

            #    if row is None:
            #        break
            #    employee = employees[row[4]]
            #    p([*row, employee['Name'] + ' ' + employee['LastName']])

        #async with conn.cursor(aiomysql.DictCursor) as cur:
        #    await cur.execute('''
        #        select tr_clock.ClockDate,inf_employee.Name,inf_employee.LastName from tr_clock
        #        inner join inf_employee on tr_clock.inf_employee_id = inf_employee.id
        #        where Date(tr_clock.ClockDate)='2019-12-31'
        #        order by tr_clock.inf_employee_id, tr_clock.ClockDate
        #    ''');
        #    for _ in range(200):
        #        row = await cur.fetchone()
        #        if row is None:
        #            break
        #        row['ClockDate'] = row['ClockDate'].isoformat()
        #        pprint(row)



    pool.close();
    await pool.wait_closed()


def grouper(iterable, n=2, fillvalue=None):
    "Collect data into fixed-length chunks or blocks"
    # grouper('ABCDEFG', 3, 'x') --> ABC DEF Gxx"
    args = [iter(iterable)] * n
    return zip_longest(*args, fillvalue=fillvalue)


SPACINGS = [4, 20, 20, 20, 4, 4, 20]
def p(r):
    ss = [a.isoformat() if isinstance(a, datetime) else str(a) for a in r]
    print(','.join(s[-l:].rjust(l) for s, l in zip(ss, SPACINGS)))

asyncio.run(main());

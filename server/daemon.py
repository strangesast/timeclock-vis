# connect to database                            check that connection is established
#   on disconnect, retry reconnect with backoff  check that reconnect attempted after disconnect
# poll database                                  check that latest record poll is retrieved
# if new record(s) in polllog                    check that after adding record, new record is found
#   read from tr_clock latest punches            check that correct set of punches is retrieved / identified
# check again after interval                     check that second poll after duration occurs

import asyncio
import aiomysql
from contextlib import asynccontextmanager
from pymysql.err import OperationalError


def get_connection(args = {}):
    return aiomysql.connect(**args)


async def main():
    conn = None
    delay = 1
    while True:
        try:
            conn = await get_connection({'host': '127.0.0.1', 'user': 'root', 'password': 'toast', 'db': 'tam', 'port':3306})
            delay = 1
            break
        except OperationalError as e:
            code, msg = e.args
            print(f'{msg} ({code}).  Retrying after {delay}s')
            await asyncio.sleep(delay)
            if delay < 300: delay *= 2

    last_poll = None
    latest_punch_id = None
    async with conn:
        while True:
            async with conn.cursor() as cur:
                await cur.execute('SELECT version()')
                version, = await cur.fetchone()
                print(f'{version=}')

                #await cur.execute('describe polllog')
                #print(await cur.fetchall())

                await cur.execute('select StartTime from polllog limit 1')
                result = await cur.fetchone()
                if result:
                    poll_date, = result
                    print(poll_date)

                await cur.execute('describe inf_employee')
                rows = await cur.fetchall()
                print('\n'.join([r for r,*_ in rows]))

                #await cur.execute('select id,Code,Name,MiddleName,LastName,HireDate from inf_employee')
                #rows = await cur.fetchall()
                #print('\n'.join([', '.join(map(str, r)) for r in rows]))

                sql = 'select id,inf_employee_id,Date from tr_clock order by id'
                if latest_punch_id is None:
                    await cur.execute(sql)
                else:
                    await cur.execute(f'{sql} where id > ?', (latest_punch_id,))

                async def gen():
                    while (row := await cur.fetchone()):
                        yield row

                async for row in gen():
                    print(row)
                    break

                    #await cur.execute('show tables');
                    #rows = await cur.fetchall()
                    #print('\n'.join([r for r, in rows]))

            break
            await asyncio.sleep(10)


if __name__ == '__main__':
    asyncio.run(main())

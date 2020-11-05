# connect to AMG server / mysql
# poll on interval / based on device schedule
# send updates to mongo, tailable collection

# init.py
import pytz
import logging
import asyncio
import aiomysql
import configparser
from datetime import datetime, timedelta

from util import get_mysql_db

tz = pytz.timezone('US/Eastern')
date_format = '%m/%d/%Y %H:%M'

async def main(config):
    mysql_client = await get_mysql_db(config['MYSQL'])
    async with mysql_client.cursor() as mysql_cursor:
        await mysql_cursor.execute('select StartTime from tam.polllog order by StartTime desc')

        rows = await mysql_cursor.fetchall()
        for i, (date,) in enumerate(rows):

            adj_date = tz.localize(date, is_dst=None).astimezone(pytz.UTC).replace(tzinfo=None)
            print('date', date.strftime(date_format).ljust(20), adj_date.strftime(date_format), adj_date - date)
            
            
            if i > 40:
                break

            #tz.localize(date)

    mysql_client.close()


if __name__ == '__main__':
    config = configparser.ConfigParser()
    config.read('config.ini')

    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
    try:
        asyncio.run(main(config))
    except KeyboardInterrupt:
        pass
    finally:
        logging.info('closing')

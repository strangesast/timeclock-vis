import configparser
import xmlrpc.client
from datetime import datetime, timedelta, date, time
from pprint import pprint

from util import get_rpc_connection, parse_timecards

if __name__ == '__main__':
    config = configparser.ConfigParser()
    config.read('config.ini')

    conn = mysql.connector.connect(
        host=config['MYSQL].get('HOST'),
        port=config['MYSQL].get('PORT'),
        user=config['MYSQL].get('USER'),
        password=config['MYSQL].get('PASSWORD'))

    proxy = get_rpc_connection(
        config['AMG'].get('HOST'),
        config['AMG'].get('PORT'),
        config['AMG'].get('PASSWORD'),
        config['AMG'].get('USERNAME'),
    )

    devices = proxy.GetDevices([])
    pprint(devices)


    cur = conn.cursor()

    cur.execute('select DeviceId, StartTime from polllog order by StartTime desc limit 1')
    row = cur.fetchone()
    print(row)

    conn.close()


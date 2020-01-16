import json
import configparser
import xmlrpc.client
from datetime import datetime, timedelta, date, time

from util import get_rpc_connection, parse_timecards


def default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()


if __name__ == '__main__':
    config = configparser.ConfigParser()
    config.read('config.ini')

    proxy = get_rpc_connection(
        config['AMG'].get('HOST'),
        config['AMG'].get('PORT'),
        config['AMG'].get('PASSWORD'),
        config['AMG'].get('USERNAME'),
    )

    
    employees_list = proxy.GetAllEmployeesShort()
    employee_ids = [empl['Id'] for empl in employees_list]

    with open('employees.json', 'w') as f:
        json.dump({empl['Id']: empl for empl in employees_list}, f, indent=2, default=default)
    
    now = datetime.combine(datetime.now().date(), time.min)
    last = now + timedelta(days=1)

    shifts = []
    while True:
        start_date = last - timedelta(weeks=4)
        end_date = last

        print(start_date, end_date)
        employee_timecards = proxy.GetTimecards(employee_ids, start_date, end_date, False)
        if all(len(tc['Timecards']) == 0 for tc in employee_timecards):
            break
        for each in employee_timecards:
            shifts.extend(parse_timecards(each['EmployeeId'], each['Timecards']))
        last = start_date

    with open(f'shifts.json', 'w') as f:
        json.dump(shifts, f, indent=2, default=default)


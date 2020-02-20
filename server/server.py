import os
import json
import configparser
import asyncio
from functools import reduce
import weakref
import pymongo
from datetime import datetime, date, timedelta, timezone
import motor.motor_asyncio
from bson.json_util import dumps
from aiohttp import web, WSCloseCode
import models
from util import get_async_rpc_connection, parse_timecards, merge_nearby_shifts, get_mongo_db

routes = web.RouteTableDef()
EMPLOYEE_IDS = ['50', '53', '71', '61', '82', '73', '55', '72', '66', '62', '69', '67', '80', '79', '57', '51', '70', '74', '54', '56', '58', '59', '64', '65']

'''
@routes.get('/data/shifts')
async def get_shifts(request):
    req_q = request.query
    # limit response count?
    # "after" some id
    # "minDate", "maxDate"
    query = {}

    if 'minDate' in req_q and 'maxDate' in req_q:
        try:
            minDate, maxDate = req_q['minDate'], req_q['maxDate']
            minDate, maxDate = map(lambda s: s.replace('Z', '+00:00'), [minDate, maxDate])
            minDate, maxDate = map(datetime.fromisoformat, [minDate, maxDate])
        except ValueError as e:
            return web.HTTPBadRequest(body='invalid date')

        query = {'$or': [
            {'start': {'$gt': minDate, '$lt': maxDate}},
            {'start': {'$gt': minDate}, 'end': None},
            {'end':   {'$gt': minDate, '$lt': maxDate}},
            {'start': {'$lt': minDate}, 'end': {'$gt': maxDate}},
        ]}

    if 'employee' in req_q:
        try:
            employee_id = req_q['employee']
            employee_id = int(employee_id)
            employee_id = str(employee_id)
        except ValueError as e:
            return web.HTTPBadRequest(body='invalid employee id')
        query['employee'] = employee_id
        
    cursor = request.app['db'].timeclock.shifts.find(query, {"_id": 0}).sort('_id', pymongo.ASCENDING)
    shifts = await cursor.to_list(None)

    employee_ids = sorted(list(set(s['employee'] for s in shifts)))

    cursor = request.app['db'].timeclock.employees.find({'id': {'$in': employee_ids}}, {"_id": 0})

    employees = {};
    async for employee in cursor:
        employees[employee['id']] = employee;

    #interface ShiftsResponse {
    #  shifts: Shift[];
    #  employees: Map<Employee>;
    #  employeeIds: EmployeeID[];
    #}
    #export interface EmployeeShiftsResponse {
    #  employee: Employee;
    #  shifts: Shift[];
    #}

    response: models.EmployeeShiftsResponse = {
        'shifts': shifts,
        'employeeIds': employee_ids,
        'employees': employees,
    }
    return json_response(response)
    # need encoder
    #return web.json_response({'shifts': shifts})
'''

default_min_date = datetime.combine(date.today() - timedelta(days=2), datetime.min.time())
default_max_date = datetime.combine(date.today() + timedelta(days=2), datetime.min.time())
default_employee_props = [
  'LastName',
  'MiddleName',
  'FullName',
  'Badge',
  'Active',
  'Code',
  'Id',
  'Name',
]


'''
@routes.get('/data/shifts')
async def get_shifts(request):
    """
    borked.  API returns inconsistent results based on time range
    """
    q = parse_qs(request.query)
    if employee_id := q.get('employee'):
        employees_list = await request.app['proxy'].GetEmployees([employee_id])
    else:
        employees_list = await request.app['proxy'].GetAllEmployeesShort()

    # must be ints for next api call
    employee_ids = [empl['Id'] for empl in employees_list]

    # proxy returns 'None' for null values
    employees_list = [{k: v if (v := empl.get(k)) != 'None' else None for k in default_employee_props}
            for empl in employees_list]

    # timezone is wrong
    min_date = d - timedelta(hours=10) if (d := q.get('minDate')) else default_min_date;
    min_date = min_date.replace(hour=0, minute=0, second=0, microsecond=0)
    max_date = d - timedelta(hours=10) if (d := q.get('maxDate')) else default_max_date;
    max_date = max_date.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)

    included_employee_ids = set()
    employee_timecards = await request.app['proxy'].GetTimecards(employee_ids, min_date, max_date, False)
    shifts = []
    for each in employee_timecards:
        employee_id, timecards = each['EmployeeId'], each['Timecards']
        for components in merge_nearby_shifts(parse_timecards(employee_id, timecards)):
            included_employee_ids.add(employee_id)
            start_date = components[0][0]
            end_date = components[-1][1]
            id = f'{employee_id}_{start_date.timestamp():.0f}'
            is_complete = end_date is not None
            shift_state = models.ShiftState.Complete if is_complete else models.ShiftState.Incomplete
            total_duration = reduce(lambda acc, cv: cv[1] - cv[0] + acc, components, timedelta()) if is_complete else None
            components = [{'start': start, 'end': end, 'duration': end and end - start, 'id': f'{employee_id}_{start.timestamp():.0f}'}
                    for start, end in components]
            shift = {
                'id': id,
                'employee': str(employee_id),
                'components': components,
                'start': start_date,
                'end': end_date,
                'duration': total_duration,
                'state': shift_state,
                }
            shifts.append(shift)

    shifts.sort(key = lambda v: v['start'])

    # for now return the same contents / order of employee ids
    employee_ids = list(dict.fromkeys(s['employee'] for s in shifts)) if employee_id else EMPLOYEE_IDS

    employees = {}
    for employee in employees_list:
        employee_id = employee['Id']
        key = str(employee_id)
        #if employee_id in included_employee_ids:
        employees[key] = {
            'id': key,
            'name': f'{employee["Name"]} {employee["LastName"]}',
            'color': models.EmployeeShiftColor(employee_id % len(models.EmployeeShiftColor)),
        }

    return json_response({
        'employees': employees,
        'employeeIds': employee_ids,
        'shifts': shifts
    })
'''


@routes.get('/data/shifts')
async def get_shifts(request):
    q = parse_qs(request.query)


    min_date, max_date = q.get('minDate'), q.get('maxDate')

    if min_date is None:
        min_date = datetime.now() - timedelta(hours=24)
    if max_date is None:
        max_date = datetime.now() + timedelta(hours=24)

    db = request.app['db'].timeclock;

    query = {
        '$or': [
            {'start': {'$gt': min_date, '$lt': max_date}},
            {'$and': [{'end': None}, {'start': {'$lt': max_date}}]},
            {'end': {'$gt': min_date, '$lt': max_date}},
            {'$and': [{'start': {'$lt': min_date}}, {'end': {'$gt': max_date}}]},
        ]
    }

    if employee_id := q.get('employee'):
        employee = await db.employees.find_one({'id': employee_id})
        if employee is None:
            return web.HTTPNotFound(body=f'no employee with id: "{employee_id}"')
        query['employee'] = employee_id
        employees = {employee_id: employee}
    else:
        employees = await db.employees.find({}).to_list(100)
        employees = {id: employee for employee in employees if (id := employee.get('id'))}

    shifts = await db.shifts.find(query).to_list(100000)

    return json_response({
        'employees': employees,
        'employeeIds': [employee_id] if employee_id is not None else EMPLOYEE_IDS,
        'shifts': shifts,
    });


def json_response(d):
    return web.Response(text=dumps(d, default=default))


def default(o):
    if isinstance(o, datetime):
        return o.isoformat()
    if isinstance(o, timedelta):
        return int(o.total_seconds() * 1000)


async def on_shutdown(app):
    for ws in set(app['websockets']):
        await ws.close(code=WSCloseCode.GOING_AWAY,
                       message='Server shutdown')
    #await app['proxy'].close()
    app['db'].close()


async def background(app):
    try:
        while True:
            # check db
            changes = False
            state = {}
            if changes:
                for ws in set(app['websockets']):
                    await ws.send_str(json.dumps(state, default=default))
            await asyncio.sleep(1000)
    except asyncio.CancelledError:
        pass
    finally:
        pass


async def main():
    if not os.path.isfile('config.ini'):
        raise RuntimeError('no config file found')
    config = configparser.ConfigParser()
    config.read('config.ini')

    app = web.Application()
    app['websockets'] = weakref.WeakSet()
    host = '0.0.0.0'

    app['db'] = await get_mongo_db(config['MONGO'])

    #app['proxy'] = get_async_rpc_connection(config['AMG'])

    app.add_routes(routes)
    app.on_shutdown.append(on_shutdown)

    runner = web.AppRunner(app)
    await runner.setup()

    port = '8080'
    site = web.TCPSite(runner, host, port)
    await site.start()

    try:
        await asyncio.create_task(background(app))
    finally:
        print('shutting down')
        await runner.cleanup()


def utc_to_local(dt: datetime):
    return dt.replace(tzinfo=timezone.utc).astimezone(tz=None)


def parse_qs(query):
    result = {}
    for key in ['minDate', 'maxDate']:
        if key in query:
            try:
                result[key] = datetime.fromisoformat(query[key].replace('Z', '+00:00'))
            except ValueError:
                pass
    if 'employee' in query:
        try:
            int(query['employee'])
            result['employee'] = query['employee']
        except ValueError:
            pass

    return result


if __name__ == '__main__':
    asyncio.run(main())

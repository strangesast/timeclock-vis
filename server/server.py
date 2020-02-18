import os
import json
import asyncio
from functools import reduce
import weakref
import pymongo
from datetime import datetime, date, timedelta
import motor.motor_asyncio
from bson.json_util import dumps
from aiohttp import web, WSCloseCode
import models
from util import get_async_rpc_connection, parse_timecards

routes = web.RouteTableDef()

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


@routes.get('/data/shifts')
async def get_shifts(request):
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

    min_date = q.get('minDate') or default_min_date;
    max_date = q.get('maxDate') or default_max_date;

    included_employee_ids = set()
    employee_timecards = await request.app['proxy'].GetTimecards(employee_ids, min_date, max_date, False)
    shifts = []
    for each in employee_timecards:
        employee_id, timecards = each['EmployeeId'], each['Timecards']
        included_employee_ids.add(employee_id)
        for components in merge_nearby_shifts(parse_timecards(employee_id, timecards)):
            start_date = components[0][0]
            end_date = components[-1][1]
            id = f'{employee_id}_{start_date.timestamp():.0f}'
            is_complete = end_date is not None
            shift_state = models.ShiftState.Complete if is_complete else models.ShiftState.Incomplete
            total_duration = reduce(lambda acc, cv: cv[1] - cv[0] + acc, components, timedelta()) if not is_complete else None
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

    employees = {}
    employee_ids = []
    for employee in employees_list:
        employee_id = employee['Id']
        if employee_id in included_employee_ids:
            employees[employee_id] = {
                'id': str(employee_id),
                'name': f'{employee["Name"]} {employee["LastName"]}',
                'color': models.EmployeeShiftColor(employee_id % len(models.EmployeeShiftColor)),
            }
            employee_ids.append(str(employee_id))

    return json_response({
        'employees': employees,
        'employeeIds': employee_ids,
        'shifts': shifts
    })


def json_response(d):
    return web.Response(text=json.dumps(d, default=default))


def default(o):
    if isinstance(o, datetime):
        return o.isoformat()
    if isinstance(o, timedelta):
        return int(o.total_seconds() * 1000)


async def on_shutdown(app):
    for ws in set(app['websockets']):
        await ws.close(code=WSCloseCode.GOING_AWAY,
                       message='Server shutdown')
    await app['proxy'].close()
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
    app = web.Application()
    app['websockets'] = weakref.WeakSet()
    host = '0.0.0.0'

    app['db'] = motor.motor_asyncio.AsyncIOMotorClient(f'mongodb://user:password@{host}:27017')
    app['proxy'] = get_async_rpc_connection(
        os.environ.get('AMG_HOST'),
        os.environ.get('AMG_PORT'),
        os.environ.get('AMG_PASSWORD'),
        os.environ.get('AMG_USERNAME'),
    )

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


def merge_nearby_shifts(it):
    last_end = None
    components = []
    for shift in it:
        start_date, end_date = shift
        if last_end is not None and start_date - last_end < timedelta(hours=4):
            components.append(shift)
        else:
            if len(components):
                yield components

            components = [shift]

        last_end = end_date

    if len(components):
        yield components


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
            result['employee'] = int(query['employee'])
        except ValueError:
            pass

    return result


if __name__ == '__main__':
    asyncio.run(main())

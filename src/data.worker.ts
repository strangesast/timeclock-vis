import * as Comlink from 'comlink';
import { formatTime, addHours, inFieldOfView } from './util';
import * as models from './models';


declare const GENERATE_MOCKING: boolean;

let obj: models.Sig;

console.log('MOCKING?', GENERATE_MOCKING);
if (GENERATE_MOCKING) {
  let data = null;

  obj = {
    type: 'mocking',
    data,
    async initializeData(date = new Date()) {
      data = require('./mocking').generateData(date);
    },
    async getShiftsInRange([minDate, maxDate]: models.DateRange): Promise<models.ShiftsResponse> {
      if (data == null) throw new Error('data not initialized');
      const { shifts, employees } = data;
      const filteredShifts: models.Shift[] = [];
      const filteredEmployees = {};
      const employeeIds = [];
      for (const shift of shifts) {
        if (inFieldOfView([shift.start, shift.end], [minDate, maxDate])) {
          const employeeId = shift.employee.id;
          if (!employeeIds.includes(employeeId)) {
            filteredEmployees[employeeId] = employees[employeeId];
            employeeIds.push(employeeId);
          }
          filteredShifts.push(shift);
        }
      }
      return { shifts: filteredShifts, employees: filteredEmployees, employeeIds };
    },
    async getShiftsByEmployeeInRange(employeeId: models.EmployeeID, [minDate, maxDate]: models.DateRange): Promise<models.ShiftsResponse> {
      if (data == null) throw new Error('data not initialized');
      const { shifts, employees } = data;
      const employee = employees[employeeId];
      const filteredShifts: models.Shift[] = [];
      for (const shift of shifts) {
        if (shift.employee.id == employeeId && inFieldOfView([shift.start, shift.end], [minDate, maxDate])) {
          filteredShifts.push(shift);
        }
      }
      return {shifts: filteredShifts, employees: {[employeeId]: employee}, employeeIds: [employeeId]};
    },
  };
} else {
  obj = {
    type: 'fetch',
    async getShiftsInRange([minDate, maxDate]: models.DateRange) {
      const url = new URL(`/data/shifts`, location.origin);
      url.searchParams.set('minDate', minDate.toISOString());
      url.searchParams.set('maxDate', maxDate.toISOString());
      const res = await fetch(url.toString());
      if (res.status < 200 || res.status >= 400) {
        throw new Error(`failed to fetch shifts: ${res.statusText}`);
      }
      const content = await res.json();
      interpretResponse(content);
      return content;
    },
    async getShiftsByEmployeeInRange(employeeId: models.EmployeeID, [minDate, maxDate]: models.DateRange) {
      const url = new URL(`/data/shifts`, location.origin);
      url.searchParams.set('minDate', minDate.toISOString());
      url.searchParams.set('maxDate', maxDate.toISOString());
      url.searchParams.set('employee', employeeId);
      const res = await fetch(url.toString());
      if (res.status < 200 || res.status >= 400) {
        throw new Error(`failed to fetch shifts: ${res.statusText}`);
      }
      const content = await res.json();
      interpretResponse(content);
      return content;
    },
  }
}

async function get(key) {
  const res = await fetch(`data/${key}.json`);
  const json = await res.json();
  return json;
}

/*
Object.assign(obj, {
  data: {
    shifts: get('shifts').then(arr => {
      for (const each of arr) {
        each['start'] = new Date(each['start']);
        each['end'] = each['end'] != null ? new Date(each['end']) : null;
      }
      return arr;
    }),
    employees: get('employees').then(arr => {
      return Object.values(arr).reduce((acc, {id, Code, Name, MiddleName, LastName}) => {
        acc[id] = {id, name: {first: Name, last: LastName}};
        return acc;
      }, {});
    }),
  },
  async getEmployees() {
    return Object.values(await obj.data.employees);
  },
  async getEmployeeShifts(ids: number[], [fromDate, toDate]): Promise<{[id: string]: any[]}> {
    const shifts = await obj.data.shifts;
    const subset = ids.reduce((acc, id) => ({...acc, [id]: []}), {});
    for (const shift of shifts) {
      if (ids.includes(shift.employee)) {
        subset[shift.employee].push(shift);
      }
    }
    return subset;
  },
  async getData([fromDate, toDate]) {
    const allShifts = await obj.data.shifts;
    const allEmployees = await obj.data.employees;
    const shifts = [];
    const employees = {};
    const employeeIds = []
    for (const shift of allShifts) {
      if (inFieldOfView([shift.start, shift.end], [fromDate, toDate])) {
        const employeeId = shift.employee;
        const employee = allEmployees[employeeId];
        if (!employeeIds.includes(shift.employee)) {
          employeeIds.push(employeeId);
          employees[employeeId] = employee;
        }
        let state, typicalEnd = null;
        if (shift.end != null) {
          state = ShiftState.Complete;
        } else {
          // made up bs
          typicalEnd = new Date(shift.start);
          typicalEnd.setHours(typicalEnd.getHours() + 8);
          state = ShiftState.Incomplete;
        }
        shifts.push({
          id: shift.id,
          employee,
          shift: {state, actual: {start: shift.start, end: shift.end}, typical: {start: null, end: typicalEnd}},
          pos: {x: 0, y: 0, w: 0, x1: 0, w1: 0, yi: 0},
          display: {
            center: employee.name.first + ' ' + employee.name.last,
            left: formatTime(shift.start),
            right: formatTime(state === ShiftState.Complete ? shift.end : typicalEnd),
          },
        });
      }
    }
    return {employeeIds, employees, shifts};
  }
});
*/

function sortBy(arr) {
  return function (a, b) {
    for (const key of arr) {
      if (a[key] > b[key]) return 1;
      if (a[key] < b[key]) return -1;
    }
    return 0;
  }
}

function interpretResponse(content) {
  const {shifts, employees, employeeIds} = content;
  for (const shift of shifts) {
    if (shift['_id'] != null && '$oid' in shift['_id']) {
      shift['_id'] = shift['_id']['$oid'];
    }
    shift.started = true;
    if (typeof shift.expectedDuration !== "number") {
      shift.expectedDuration = 2.88e7;
    }
    if (shift.start != null && '$date' in shift.start) {
      shift.start = new Date(shift.start['$date']);
    } else if (typeof shift.start === 'string') {
      shift.start = new Date(shift.start);
    }
    if (shift.end != null && '$date' in shift.end) {
      shift.end = new Date(shift.end['$date']);
    } else if (typeof shift.end === 'string') {
      shift.end = new Date(shift.end);
    }
    if (Array.isArray(shift.components)) {
      for (const comp of shift.components) {
        comp.showTime = true;
        if (comp.start != null && '$date' in comp.start) {
          comp.start = new Date(comp.start['$date']);
        } else if (typeof comp.start === 'string') {
          comp.start = new Date(comp.start);
        }
        if (comp.end != null && '$date' in comp.end) {
          comp.end = new Date(comp.end['$date']);
        } else if (typeof comp.end === 'string') {
          comp.end = new Date(comp.end);
        } else if (comp.end == null) {
          comp.end = new Date();
        }
      }
    }
  }
  for (const empl of Object.values(employees) as any[]) {
    if (empl['_id'] != null && '$oid' in empl['_id']) {
      empl['_id'] = empl['_id']['$oid'];
    }
    if (empl.HireDate != null && '$date' in empl.HireDate) {
      empl.HireDate = new Date(empl.HireDate['$date']);
    } else if (typeof empl.HireDate === 'string') {
      empl.HireDate = new Date(empl.HireDate);
    }
    if (empl.stats) {
      for (const [key, value] of Object.entries(empl.stats)) {
        if (value != null && value['$date']) {
          empl.stats[key] = new Date(value['$date']);
        }
      }
    }
  }
}

Comlink.expose(obj, self as any);

import * as Comlink from 'comlink';
import { formatTime, addHours, inFieldOfView } from './util';
import { EmployeeID, Employee, Shift, ShiftState } from './models';


declare const GENERATE_MOCKING: boolean;

type DateRange = [Date, Date];

interface SigBase {
  type: string;
  getShiftsInRange: (range: DateRange) => Promise<ShiftsResponse>;
  getShiftsByEmployeeInRange: (employeeId: EmployeeID, range: DateRange) => Promise<EmployeeShiftsResponse>;
}

interface Map<T> {
  [id: string]: T;
}

interface ShiftsResponse {
  shifts: Shift[];
  employees: Map<Employee>;
  employeeIds: EmployeeID[];
}

interface EmployeeShiftsResponse {
  employee: Employee;
  shifts: Shift[];
}

interface SigMocking extends SigBase {
  type: 'mocking';
  data: any;
  initializeData: (date: Date) => Promise<void>;
}

interface SigFetch extends SigBase {
  type: 'fetch';
}

type Sig = SigMocking | SigFetch;

let obj: Sig;

console.log('MOCKING?', GENERATE_MOCKING);
if (GENERATE_MOCKING) {
  let data = null;

  obj = {
    type: 'mocking',
    data,
    async initializeData(date = new Date()) {
      data = require('./mocking').generateData(date);
    },
    async getShiftsInRange([minDate, maxDate]: DateRange): Promise<ShiftsResponse> {
      if (data == null) throw new Error('data not initialized');
      const { shifts, employees } = data;
      const filteredShifts: Shift[] = [];
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
    async getShiftsByEmployeeInRange(employeeId: EmployeeID, [minDate, maxDate]: DateRange): Promise<EmployeeShiftsResponse> {
      if (data == null) throw new Error('data not initialized');
      const { shifts, employees } = data;
      const employee = employees[employeeId];
      const filteredShifts: Shift[] = [];
      for (const shift of shifts) {
        if (shift.employee.id == employeeId && inFieldOfView([shift.start, shift.end], [minDate, maxDate])) {
          filteredShifts.push(shift);
        }
      }
      return {shifts: filteredShifts, employee};
    },
  };
} else {
  obj = {
    type: 'fetch',
    async getShiftsInRange([minDate, maxDate]: DateRange) {
      const url = new URL(`/data/shifts`, location.origin);
      url.searchParams.set('minDate', minDate.toISOString());
      url.searchParams.set('maxDate', minDate.toISOString());
      const res = await fetch(url.toString());
      return await res.json();
    },
    async getShiftsByEmployeeInRange(employeeId: EmployeeID, [minDate, maxDate]: DateRange) {
      const url = new URL(`/data/shifts`, location.origin);
      url.searchParams.set('minDate', minDate.toISOString());
      url.searchParams.set('maxDate', minDate.toISOString());
      url.searchParams.set('employee', employeeId);
      const res = await fetch(url.toString());
      return await res.json();
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

Comlink.expose(obj, self as any);

import * as Comlink from 'comlink';
import { ShiftState } from './data';

async function get(key) {
  const res = await fetch(`data/${key}.json`);
  const json = await res.json();
  return json;
}
const obj = {
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
  async getData([fromDate, toDate]) {
    const shifts = await obj.data.shifts;
    const employees = await obj.data.employees;
    const subset = shifts
      .filter(({start, end}) => {
        if (start > fromDate && start < toDate) return true; // start side
        if (end == null) return true; // in progress
        if (end > fromDate && end < toDate) return true; // end side
        if (start < fromDate && end > toDate) return true;
        return false;
      })
      .sort(sortBy(['employee', 'start']))
      .map(({id, employee: employeeId, start, end }) => {
        const employee = employees[employeeId];
        let state, typicalEnd = null;
        if (end != null) {
          state = ShiftState.Complete;
        } else {
          typicalEnd = new Date(start);
          typicalEnd.setHours(typicalEnd.getHours() + 8);
          state = ShiftState.InProgress;
        }
        return {
          id,
          employee,
          shift: {state, actual: {start, end}, typical: {start: null, end: typicalEnd}},
          pos: {x: 0, y: 0, w: 0, x1: 0, w1: 0, yi: 0},
        };
      });
    let yi = -1, lastEmployeeId;
    for (const each of subset) {
      if (lastEmployeeId != each.employee.id) {
        lastEmployeeId = each.employee.id;
        yi++;
      }
      each.pos.yi = yi;
    }
    return subset;
  }
};

function sortBy(arr) {
  return function (a, b) {
    for (const key of arr) {
      if (a[key] > b[key]) return 1;
      if (a[key] < b[key]) return -1;
    }
    return 0;
  }
}

// self.addEventListener('message', (e) => console.log(e));

Comlink.expose(obj);

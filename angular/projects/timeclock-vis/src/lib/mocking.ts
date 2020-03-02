import * as d3 from 'd3';
import * as faker from 'faker';
import { Employee, EmployeeShiftColor } from './models/employee';
import { Shift, ShiftComponentType, ShiftState, ShiftComponent } from './models/shift';

export const EMPLOYEE_SHIFT_COLORS = Object.values(EmployeeShiftColor).filter(v => typeof v === 'string');

export function generateData(now = new Date(), fuzzy = 30): {shifts: Shift[], employees: {[id: string]: Employee}} {
  const employees: {[id: string]: Employee} = {};
  const shifts: Shift[] = [];

  const EMPLOYEE_COUNT = 10;

  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    // start hour
    const h = Math.floor((6 + (i / EMPLOYEE_COUNT) * 14) * 2) / 2;
    // start hours
    const hh = Math.floor(h);
    // start minutes
    const mm = (h - hh) * 60;
    // start time on Jan 1, 2000
    const start = new Date(2000, 0, 1, Math.floor(h), mm);
    // end time on Jan 1, 2000
    const end = new Date(start);
    end.setHours(end.getHours() + 8, end.getMinutes() + 30); // add 8.5 hours, uh maybe

    const id = i.toString();

    const color = EmployeeShiftColor[EMPLOYEE_SHIFT_COLORS[i % EMPLOYEE_SHIFT_COLORS.length]];

    employees[id] = {
      _id: id,
      id,
      Code: ('0'.repeat(4) + (i + 1)).slice(-4),
      Name: faker.name.firstName(),
      MiddleName: String.fromCharCode((i % 26) + 65),
      LastName: faker.name.lastName(),
      HireDate: new Date(),
      shift: { start, end, duration: 2.88e7 },
      color,
    };
  }

  const DAY_COUNT = 28;
  const days = [];
  let date = d3.timeDay.offset(d3.timeWeek.floor(now), -DAY_COUNT + 7);
  for (let i = 0; i < DAY_COUNT; i++) {
    days.push(date);
    date = new Date(date);
    date = d3.timeDay.offset(date, 1);
  }

  let lastShiftId = 0;
  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    const employee = employees[i];
    for (let j = 1; j < days.length - 1; j++) {
      const shiftId = (++lastShiftId).toString();
      const shiftRow = i % 7;
      let cumDuration = 0;
      let started = false;
      const day = days[j];

      const h = Math.floor((6 + (i / EMPLOYEE_COUNT) * 10) * 2) / 2;
      const punches: Date[] = [];
      let punch;
      let projectedStart;
      let projectedEnd;

      punch = new Date(day);
      punch.setHours(0, 0, 0, 0);
      punch = new Date(+punch + +employee.shift.start - +new Date(2000, 0, 1));
      projectedStart = new Date(punch);

      projectedEnd = new Date(projectedStart);
      projectedEnd.setHours(projectedEnd.getHours() + 8, projectedEnd.getMinutes() + 30);

      if (fuzzy) {
        punch.setHours(punch.getHours(), punch.getMinutes() + fuzzy * (Math.random() - 0.5));
      }

      if (punch < now) {
        started = true;
        punches.push(punch);
      }

      punch = new Date(punch);
      punch.setHours(punch.getHours() + 4);

      if (fuzzy) {
        punch.setHours(punch.getHours(), punch.getMinutes() + fuzzy * (Math.random() - 0.5));
      }

      if (punch < now) {
        punches.push(punch);
      }

      punch = new Date(punch);
      punch.setHours(punch.getHours(), punch.getMinutes() + 30);

      if (fuzzy) {
        punch.setHours(punch.getHours(), punch.getMinutes() + fuzzy * (Math.random() - 0.5));
      }

      if (punch < now) {
        punches.push(punch);
      }

      punch = new Date(punch);
      punch.setHours(punch.getHours() + 4);

      if (fuzzy) {
        punch.setHours(punch.getHours(), punch.getMinutes() + fuzzy * (Math.random() - 0.5));
      }

      if (punch < now) {
        punches.push(punch);
      }

      const components: ShiftComponent[] = [];
      const employeeId = employee.id;
      for (let k = 0; k < 2; k++) {
        const componentId = shiftId + '-' + k;
        const start = punches[k * 2];
        if (start == null) {
          break;
        }
        let end = punches[k * 2 + 1];
        let state: ShiftState;

        if (end == null) {
          end = now;
          state = ShiftState.Incomplete;
        } else {
          state = ShiftState.Complete;
        }
        const duration = +end - +start;
        cumDuration += duration;

        components.push({
          _id: componentId,
          id: componentId,
          type: ShiftComponentType.Actual,
          state,
          start,
          end,
          duration,
        });
      }

      if (punches.length !== 4) {
        components.unshift({
          _id: shiftId + '-' + (9).toString(),
          type: ShiftComponentType.Projected,
          start: new Date(punches.length === 3 ? punches[2] : punches.length === 1 ? punches[0] : projectedStart),
          end: projectedEnd,
          duration: projectedEnd - projectedStart,
        });
      }

      shifts.push({
        _id: shiftId,
        row: shiftRow,
        id: shiftId,
        employee: employee.id,
        components,
        start: new Date(punches.length > 0 ? punches[0] : projectedStart),
        end: new Date((punches.length > 0 && punches.length % 2 === 0) ? punches[punches.length - 1] : projectedEnd),
        duration: cumDuration,
        expectedDuration: employee.shift.duration,
      });
    }
  }

  return { employees, shifts };
}

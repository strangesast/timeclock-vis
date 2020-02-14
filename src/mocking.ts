import * as d3 from 'd3';
import * as models from './models';

export function generateData(now = new Date(), fuzzy = 30): {shifts: models.Shift[], employees: {[id: string]: models.Employee}} {
  const employees: {[id: string]: models.Employee} = {},
    shifts: models.Shift[] = [];

  const EMPLOYEE_COUNT = 10;

  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    // start hour
    const h = Math.floor((6 + (i / EMPLOYEE_COUNT) * 10) * 2) / 2
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

    employees[id] = {
      id,
      name: `Employee ${i + 1}`,
      shift: { start, end, duration: 2.88e7 },
      color: models.EmployeeShiftColor[models.EMPLOYEE_SHIFT_COLORS[i % models.EMPLOYEE_SHIFT_COLORS.length]],
    };
  }
  
  const days = [];
  let date = new Date(now);
  date.setDate(date.getDate() - date.getDay());
  for (let i = 0; i < 7; i++) {
    days.push(date);
    date = new Date(date);
    date.setDate(date.getDate() + 1);
  }
  
  let lastShiftId = 0;
  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    const employee = employees[i];
    for (let j = 1; j < days.length - 1; j++) { 
      let cumDuration = 0;
      let started = false;
      const day = days[j];

      const h = Math.floor((6 + (i / EMPLOYEE_COUNT) * 10) * 2) / 2
      const punches: Date[] = []
      let punch, projectedStart, projectedEnd;
  
      punch = new Date(day);
      punch.setHours(0, 0, 0, 0);
      punch = new Date(+punch + +employee.shift.start - +new Date(2000, 0, 1));
      projectedStart = new Date(punch);

      projectedEnd = new Date(projectedStart);
      projectedEnd.setHours(projectedEnd.getHours() + 8, projectedEnd.getMinutes() + 30);

      if (fuzzy) {
        punch.setHours(punch.getHours(), punch.getMinutes() + fuzzy * (Math.random() - 0.5))
      }
  
      if (punch < now) {
        started = true;
        punches.push(punch);
      }
  
      punch = new Date(punch);
      punch.setHours(punch.getHours() + 4);

      if (fuzzy) {
        punch.setHours(punch.getHours(), punch.getMinutes() + fuzzy * (Math.random() - 0.5))
      }
 
      if (punch < now) punches.push(punch);
  
      punch = new Date(punch);
      punch.setHours(punch.getHours(), punch.getMinutes() + 30);

      if (fuzzy) {
        punch.setHours(punch.getHours(), punch.getMinutes() + fuzzy * (Math.random() - 0.5))
      }
 
      if (punch < now) punches.push(punch);
  
      punch = new Date(punch);
      punch.setHours(punch.getHours() + 4);

      if (fuzzy) {
        punch.setHours(punch.getHours(), punch.getMinutes() + fuzzy * (Math.random() - 0.5))
      }

      if (punch < now) punches.push(punch);
  
      const components: models.ShiftComponent[] = [];
      const employeeId = employee.id;
      for (let i = 0; i < 2; i++) {
        const start = punches[i * 2];
        if (start == null) {
          break;
        }
        let end = punches[i * 2 + 1];
        let state: models.ShiftState;
  
        if (end == null) {
          end = now;
          state = models.ShiftState.Incomplete;
        } else {
          state = models.ShiftState.Complete;
        }
        const duration = +end - +start;
        cumDuration += duration;
  
        components.push({
          showTime: true,
          type: models.ShiftComponentType.Actual,
          state,
          start,
          end,
          duration,
          employeeId,
          x: 0,
          w: 0,
          fill: null,
        });
      }
  
      if (punches.length != 4) {
        components.unshift({
          showTime: components.length == 0,
          type: models.ShiftComponentType.Projected,
          start: new Date(punches.length == 3 ? punches[2] : punches.length == 1 ? punches[0] : projectedStart),
          end: projectedEnd,
          duration: projectedEnd - projectedStart,
          employeeId,
          x: 0,
          w: 0,
          fill: null,
        });
      }
  
      shifts.push({
        x: 0,
        y: 0,
        id: (++lastShiftId).toString(),
        employee,
        components,
        started,
        punches: punches.map(date => ({date})),
        start: new Date(punches.length > 0 ? punches[0] : projectedStart),
        end: new Date((punches.length > 0 && punches.length % 2 == 0) ? punches[punches.length - 1] : projectedEnd),
        duration: cumDuration,
        expectedDuration: employee.shift.duration,
      });
    }
  }

  return { employees, shifts };
}

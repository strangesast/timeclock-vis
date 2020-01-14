import * as faker from 'faker';
import {ShiftState} from './util';

let lastEmployeeId = 0;
let lastRecordId = 0;

export function getData(date: Date, length = 10) {
  // complete, in progress, upcoming fractions. total of 'length' data
  const a = Math.floor(length / 5);
  const c = Math.floor(length / 5);
  const b = length - a - c;

  return [
    ...Array(a).fill(ShiftState.Complete),
    ...Array(b).fill(ShiftState.InProgress),
    ...Array(c).fill(ShiftState.Upcoming),
  ].map(shiftState => {
    const [first, last] = [faker.name.firstName(), faker.name.lastName()];
    return {
      id: (++lastRecordId).toString(),
      employee: {name: {first, last}, id: (++lastEmployeeId).toString() },
      shift: createFakeShift(shiftState, date),
      pos: {x: 0, y: 0, w: 0, x1: 0, w1: 0},
    };
  });
}

function createFakeShift(shiftState: ShiftState, date: Date) {
  const shift = {
    typical: {start: null, end: null, total: null},
    actual: {start: null, end: null, total: null},
    state: shiftState,
  };
  switch (shiftState) {
    case ShiftState.Complete: {
      const duration = fuzzy(8);
      const timePast = fuzzy(4);
      shift.actual.end = new Date(+date - timePast * 3.6e6);
      shift.typical.end = roundDateTo(shift.actual.end, 2, true);
      shift.actual.start = new Date(+date - (timePast + duration) * 3.6e6);
      shift.typical.start = roundDateTo(shift.actual.start, 2, false);
      shift.actual.total = (+shift.actual.end - shift.actual.start) / 3.6e6;
      shift.typical.total = (+shift.typical.end - shift.typical.start) / 3.6e6;
      break;
    }
    case ShiftState.InProgress: {
      const timePast = fuzzy(4);
      const duration = fuzzy(8);
      shift.actual.start = new Date(+date - timePast * 3.6e6);
      shift.typical.start = roundDateTo(shift.actual.start, 2, false);
      shift.actual.end = null;
      shift.typical.end = roundDateTo(+shift.typical.start + duration * 3.6e6, 2, true);
      break;
    }
    case ShiftState.Upcoming: {
      const timePast = fuzzy(4);
      const duration = fuzzy(8);
      shift.actual.start = null;
      shift.typical.start = new Date(roundDateTo(+date + timePast * 3.6e6, 2, true));
      shift.actual.end = null;
      shift.typical.end = roundDateTo(+shift.typical.start + duration * 3.6e6, 2, false);
      break;
    }
  }
  return shift;
}

function roundDateTo(date: Date|number, den = 4, roundDown = true): Date {
  const d = new Date(date);
  d.setMilliseconds(0);
  d.setSeconds(0);
  d.setMinutes(Math.floor(d.getMinutes() / (60 / den) + (roundDown ? 0 : 1)) * (60 / den));
  return d;
}

function fuzzy(num: number): number {
  return num * (0.9 + 0.2 * Math.random());
}

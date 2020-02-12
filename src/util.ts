export const colors = {
  lightBlue: '#cfe2f3',
  darkBlue: '#6fa8dc',
  lightGreen: '#93c47d',
};

export enum ShiftState {
  Complete = 0,
  InProgress = 1,
  Upcoming = 2,
}

export interface Employee {
  id: number;
  name: {
    first: string;
    last: string;
  }
}

export interface Shift {
  id: string,
  shift: {
    state: ShiftState;
    actual: {start: Date, end: Date|null};
    typical: {start: Date, end: Date};
  };
  display: {left: string, right: string, center: string};
  employee: {
    name: {first: string, last: string}
  };
}

/*
export function formatTime(d: Date): string {
  return `${d.getHours() || 12}:${('0' + d.getMinutes()).slice(-2)}`;
}
*/

export function formatDate (date: Date) {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const hh = ('0' + date.getHours()).slice(-2);
  const mm = ('0' + date.getMinutes()).slice(-2);
  const yyyy = date.getFullYear();
  return `${m}/${d}/${yyyy} ${hh}:${mm}`;
}

export function formatTime (d, ms = false) {
  const h = d.getHours();
  const mm = ('0' + d.getMinutes()).slice(-2);
  let s = `${h}:${mm}`;
  if (ms) {
    s += '.' + ('0' + d.getSeconds()).slice(-2);
  }
  return s;
};

export function formatDuration (f) {
  const hours = Math.floor(f / 3.6e6);
  f -= hours * 3.6e6;
  const minutes = Math.floor(f / 6e4);
  f -= minutes * 6e4;
  const seconds = Math.floor(f / 1e3);
  let s;
  if (hours > 0) {
    s = hours + ':' + ('0' + minutes).slice(-2);
  } else {
    s = minutes;
  }
  return s + '.' + ('0' + seconds).slice(-2);
};

export function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

export function throttle(fn, cb, delay = 200) {
  let timeout, waiting = false, i = 0;
  const func = (...args) => {
    const j = ++i;
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      let res = await fn(...args);
      if (j === i) {
        waiting = false;
        cb(res);
      }
    }, waiting === true ? delay : 0);
    waiting = true;
  };
  func.timeout = timeout;
  return func;
}

export function debounce(cb, delay = 1000) {
  let timeout;
  const fn = (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => cb(...args), delay);
  };
  fn.timeout = timeout;
  return fn;
}

export function sortBy(keys) {
  return function(a, b) {
    for (const key of keys) {
      if (a[key] < b[key]) return -1;
      if (a[key] > b[key]) return 1;
    }
    return 0;
  }
}

export function inFieldOfView([start, end], [fromDate, toDate]): boolean {
  if (start > fromDate && start < toDate) return true; // start side
  if (end == null) return true; // in progress
  if (end > fromDate && end < toDate) return true; // end side
  if (start < fromDate && end > toDate) return true;
  return false;
}

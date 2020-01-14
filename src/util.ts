export enum ShiftState {
  Complete = 0,
  InProgress = 1,
  Upcoming = 2,
}

export function formatTime(d: Date): string {
  return `${d.getHours() || 12}:${('0' + d.getMinutes()).slice(-2)}`;
}

export function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

export function throttle(fn, cb, delay = 200) {
  let call, waiting = false, i = 0;
  return (...args) => {
    const j = ++i;
    clearTimeout(call);
    call = setTimeout(async () => {
      let res = await fn(...args);
      if (j === i) {
        waiting = false;
        cb(res);
      }
    }, waiting === true ? delay : 0);
    waiting = true;
  };
}

export function debounce(fn, delay = 1000) {
  let call;
  return (...args) => {
    clearTimeout(call);
    call = setTimeout(() => fn(...args), delay);
  };
}

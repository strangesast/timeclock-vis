import { empty, merge, Observable, interval, range, timer } from 'rxjs';
import { map, startWith, repeat, takeUntil, first, ignoreElements, share, zip, flatMap, tap, finalize, retryWhen, switchMap } from 'rxjs/operators';
import { html, render } from 'lit-html';
import { repeat as templateRepeat } from 'lit-html/directives/repeat';

import { socket } from './socket';

const SOCKET_URL = `ws://${window.location.host}/socket`;
const RECENT_THRESHOLD = 3.6e6 * 2 // 2 hours

socket(SOCKET_URL).pipe(
  tap(stream => {
    // connected, waiting on data
    console.log('new connection');
  }),
  retryWhen(attempts => {
    return range(1, 10).pipe(zip(attempts), flatMap(([i, err]) => {
      const wait = 1e4; // 10s
      let now = new Date();
      const fut = new Date(+now + wait);
      console.log(`Connection failed: Attempt ${i}, retrying in ${(wait / 1000).toFixed(0)}s.`);
      const t = timer(wait).pipe(share());
      return merge(
        interval(1000).pipe(
          tap((i) => {
            now = new Date();
            const d = Math.round((+fut - +now)/1000);
            console.log(`Retrying in ${d}s.`);
          }),
          takeUntil(t),
          ignoreElements()
        ),
        t.pipe(finalize(() => console.log('done waiting'))),
      );
    }));
  }),
  share(),
  map(messages => messages.pipe(map(str => JSON.parse(str)))),
  switchMap(messages =>
    merge(
      messages.pipe(first(), ignoreElements(), finalize(() => {
        // connected, received some data
        console.log('first!');
      })),
      messages.pipe(finalize(() => {
        // lost connection
        console.log('end of connection');
      })),
    )
  ),
  repeat(),
  switchMap(drawAndUpdate),
).subscribe(
  null,
  err => console.log('error', err),
  () => console.log('complete'),
);

function drawAndUpdate(data) {
  console.log('data', data);
  if (!data || !data.shifts || !data.employees) {
    return empty();
  }

  data['lastPoll'] = new Date(data['lastPoll']);
  data['nextPoll'] = new Date(data['nextPoll']);
  data['nextRetry'] = new Date(data['nextRetry']);
  for (const shift of data.shifts) {
    shift['StartDate'] = new Date(shift['StartDate']);
    shift['EndDate'] = shift['EndDate'] ? new Date(shift['EndDate']) : null;
  }
  return interval(1000).pipe(
    startWith(0),
    map(() => {
      const now = new Date();
      data.filteredShifts = data.shifts
        .filter(({EndDate}) => EndDate == null || +now - EndDate < RECENT_THRESHOLD)
        .sort(sortBy(['StartDate', 'EndDate', 'EmployeeId']))
        .map(shift => ({...shift, Employee: data.employees[shift['EmployeeId']]}));
      render(template(data, now), document.body);
    }),
  );
}

function sortBy(keys) {
  return function(a, b) {
    for (const key of keys) {
      if (a[key] < b[key]) return -1;
      if (a[key] > b[key]) return 1;
    }
    return 0;
  }
}

const summary = (now, lastPoll, nextPoll) => html`
  <div>${formatTime(now, true)}</div>
  <div>As of ${formatTime(lastPoll) + (lastPoll.getDate() != now.getDate() ? ' (' + (lastPoll.getMonth() + 1) + '/' + ('0' + lastPoll.getDate()).slice(-2) + ')' : '')}</div>
  <div>Next update: ${formatTime(nextPoll)}${nextPoll < now ? ' (LATE)' : ''}</div>
`;
const header = html`
  <div>Name</div><div>Clock In</div><div>Clock Out</div><div class="total">Total</div>
 `;

const employeNameTemplate = (empl) => html`
  ${empl['FullName']}
`;
const shiftTimeTemplate = (d) => html`
  <span>${d ? formatTime(d) : 'None'}</span>
`;
 
const rowsTemplate = (items, now) => html`
  ${templateRepeat(items, (item) => item['Id'], (item, index) => html`
    <div>${employeNameTemplate(item['Employee'])}</div>
    <div>
      ${shiftTimeTemplate(item['StartDate'])}
      ${item['StartDate'].getDate() != now.getDate() ? html`<span>(${item['StartDate'].getMonth() + 1}/${item['StartDate'].getDate()})</span>`: ''}
    </div>
    <div>${shiftTimeTemplate(item['EndDate'])}</div>
    <div class="total">${formatDuration((item['EndDate'] || now) - item['StartDate'])}</div>
  `)}
  `;
 
const template = (data, now) => html`
  <header>${summary(now, data.lastPoll, data.nextPoll)}</header>
  <div class="table">
    ${header}
    ${rowsTemplate(data.filteredShifts, now)}
  </div>
`;

function formatTime (d, ms = false) {
  const h = d.getHours();
  const mm = ('0' + d.getMinutes()).slice(-2);
  let s = `${h}:${mm}`;
  if (ms) {
    s += '.' + ('0' + d.getSeconds()).slice(-2);
  }
  return s;
};

function formatDuration (f) {
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

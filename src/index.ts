import { of, combineLatest, BehaviorSubject, empty, merge, Observable, interval, range, timer } from 'rxjs';
import { concat, map, startWith, repeat, takeUntil, first, ignoreElements, share, zip, flatMap, tap, finalize, retryWhen, switchMap } from 'rxjs/operators';
import { html, render } from 'lit-html';
import { repeat as templateRepeat } from 'lit-html/directives/repeat';

import { socket } from './socket';

const SOCKET_URL = `ws://${window.location.host}/socket`;
const RECENT_THRESHOLD = 3.6e6 * 2 // 2 hours

const statusStateSource = new BehaviorSubject({
  message: 'Waiting for connection',
});

// connect to socket, repeat after disconnect, retry after failure
const dataSource = socket(SOCKET_URL).pipe(
  tap(stream => {
    // connected, waiting on data
    statusStateSource.next({message: 'Got connection! Waiting for data.'});
  }),
  retryWhen(attempts => {
    const attemptStart = new Date();
    return range(1, 1e5).pipe(zip(attempts), flatMap(([attemptNumber, err]) => {
      const wait = 1e4; // 10s
      let now = new Date();
      const fut = new Date(+now + wait);
      const msg = (num, t) => `Connection failed: Attempt ${num}, retrying in ${t.toFixed(0)}s. Retrying since ${formatDate(attemptStart)}`;
      statusStateSource.next({message: msg(attemptNumber, wait / 1000)});
      const t = timer(wait).pipe(share());
      return merge(
        interval(1000).pipe(
          tap(() => {
            now = new Date();
            const d = Math.round((+fut - +now)/1000);
            statusStateSource.next({message: msg(attemptNumber, d)});
          }),
          takeUntil(t),
          ignoreElements()
        ),
        t.pipe(finalize(() => {
          statusStateSource.next({message: `Retrying...`});
        })),
      );
    }));
  }),
  share(),
  map(messages => messages.pipe(map(str => JSON.parse(str)))),
  switchMap(messages =>
    merge(
      messages.pipe(
        first(),
        tap(() => {
          // connected, received some data
          statusStateSource.next({message: `Got data!`});
        }),
        concat(timer(1000)),
        finalize(() => {
          statusStateSource.next({message: 'Operating normally'});
        }),
        ignoreElements(),
      ),
      messages.pipe(finalize(() => {
        // lost connection
        statusStateSource.next({message: `Lost connection!`});
      })),
    )
  ),
  repeat(),
  switchMap(data => {
    if (!data || !data.shifts || !data.employees) {
      return of({});
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
        data.now = now;
        return data;
      }),
    );
  })
);


combineLatest(dataSource, statusStateSource, (data, statusState) => ({data, statusState})).subscribe(
  ({data, statusState}) => {
    render(template(data, statusState), document.body);
  },
  err => console.log('error', err),
  () => console.log('complete'),
);

const summaryTemplate = (now, lastPoll, nextPoll) => html`
  <div>${formatTime(now, true)}</div>
  <div>As of ${formatTime(lastPoll) + (lastPoll.getDate() != now.getDate() ? ' (' + (lastPoll.getMonth() + 1) + '/' + ('0' + lastPoll.getDate()).slice(-2) + ')' : '')}</div>
  <div>Next update: ${formatTime(nextPoll)}${nextPoll < now ? ' (LATE)' : ''}</div>
`;
const headerTemplate = html`
  <div>Name</div><div>Clock In</div><div>Clock Out</div><div class="total">Total</div>
`;

const employeNameTemplate = (empl) => html`
  ${empl['FullName']}
`;
const shiftTimeTemplate = (d) => html`
  <span>${d ? formatTime(d) : 'None'}</span>
`;
 
const rowsTemplate = (items, now) => templateRepeat(items, (item) => item['Id'], (item, index) => {
  const isTodaysDate = item['StartDate'].getDate() != now.getDate()
  const optionalDate = isTodaysDate ?
    html`<span>(${item['StartDate'].getMonth() + 1}/${item['StartDate'].getDate()})</span>`:
    '';
  return html`
    <div>${employeNameTemplate(item['Employee'])}</div>
    <div>
      ${shiftTimeTemplate(item['StartDate'])}${optionalDate}
    </div>
    <div>${shiftTimeTemplate(item['EndDate'])}</div>
    <div class="total">${formatDuration((item['EndDate'] || now) - item['StartDate'])}</div>
  `;
});
 
const template = (data, statusState) => html`
  <header>${summaryTemplate(data.now, data.lastPoll, data.nextPoll)}</header>
  <div class="table">
    ${headerTemplate}
    ${rowsTemplate(data.filteredShifts, data.now)}
  </div>
  <div class="status">
    <p>${statusState.message}</p>
  </div>
`;

function sortBy(keys) {
  return function(a, b) {
    for (const key of keys) {
      if (a[key] < b[key]) return -1;
      if (a[key] > b[key]) return 1;
    }
    return 0;
  }
}

function formatDate (date: Date) {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const hh = ('0' + date.getHours()).slice(-2);
  const mm = ('0' + date.getMinutes()).slice(-2);
  const yyyy = date.getFullYear();
  return `${m}/${d}/${yyyy} ${hh}:${mm}`;
}

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

import { of, combineLatest, BehaviorSubject, empty, merge, Observable, interval, range, timer } from 'rxjs';
import { concat, map, startWith, repeat, takeUntil, first, ignoreElements, share, zip, flatMap, tap, finalize, retryWhen, switchMap } from 'rxjs/operators';
import { html, render } from 'lit-html';
import { repeat as templateRepeat } from 'lit-html/directives/repeat';

import { socket } from './socket';

const SOCKET_URL = `ws://${window.location.host}/socket`;
const RECENT_THRESHOLD = 3.6e6 * 2 // 2 hours

declare const MODE: string;
console.log(`Running in MODE: ` + MODE);

// connect to socket, repeat after disconnect, retry after failure
interface ShiftData {
  StartDate: Date;
  EndDate: Date;
  EmployeeId: string;
  Employee: {FullName: string};
}

interface DataSlice {
  status: {
    message: string;
  };
  data: {
    now: Date;
    lastPoll: Date;
    nextPoll: Date;
    nextRetry: Date;
    shifts: ShiftData[];
    filteredShifts: ShiftData[];
  };
}

let getDataSource: () => Observable<DataSlice>;

if (MODE == 'production') {
  getDataSource = () => {
    const statusSource = new BehaviorSubject<{message: string}>({
      message: 'Waiting for connection',
    });
    const dataSource = socket(SOCKET_URL).pipe(
      tap(stream => {
        // connected, waiting on data
        statusSource.next({message: 'Got connection! Waiting for data.'});
      }),
      retryWhen(attempts => {
        const attemptStart = new Date();
        return range(1, 1e5).pipe(zip(attempts), flatMap(([attemptNumber, err]) => {
          const wait = 1e4; // 10s
          let now = new Date();
          const fut = new Date(+now + wait);
          const msg = (num, t) => `Connection failed: Attempt ${num}, retrying in ${t.toFixed(0)}s. Retrying since ${formatDate(attemptStart)}`;
          statusSource.next({message: msg(attemptNumber, wait / 1000)});
          const t = timer(wait).pipe(share());
          return merge(
            interval(1000).pipe(
              tap(() => {
                now = new Date();
                const d = Math.round((+fut - +now)/1000);
                statusSource.next({message: msg(attemptNumber, d)});
              }),
              takeUntil(t),
              ignoreElements()
            ),
            t.pipe(finalize(() => {
              statusSource.next({message: `Retrying...`});
            })),
          );
        }));
      }),
      share(),
      switchMap(messages =>
        merge(
          messages.pipe(
            first(),
            tap(() => {
              // connected, received some data
              statusSource.next({message: `Got data!`});
            }),
            concat(timer(1000)),
            finalize(() => {
              statusSource.next({message: 'Operating normally'});
            }),
            ignoreElements(),
          ),
          messages.pipe(finalize(() => {
            // lost connection
            statusSource.next({message: `Lost connection!`});
          })),
        )
      ),
      repeat(),
      switchMap((data: any) => {
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
    return combineLatest(dataSource, statusSource, (data, status) => ({ data, status }))
  }
} else {
  getDataSource = () => {
    return interval(1000).pipe(
      map(i => {
        const now = new Date();
        const status = {message: `Tick ${i}`};
        const lastPoll = new Date();
        lastPoll.setHours(lastPoll.getHours(), 0, 0, 0);
        const nextPoll = new Date(lastPoll);
        nextPoll.setHours(nextPoll.getHours() + 1);
        const nextRetry = new Date();
        const shifts = [];
        const StartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6);
        const EndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16);
        const filteredShifts = Array.from(Array(50)).map((_, i) => ({
          StartDate,
          EndDate,
          EmployeeId: i.toFixed(0),
          Employee: {'FullName': `Employee ${i + 1}`},
        }));
        return {status, data: {now, lastPoll, nextPoll, nextRetry, shifts, filteredShifts}};
      }),
    );
  }
}

getDataSource().subscribe(
  ({data, status}) => {
    render(template(data, status), document.body);
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

const employeeNameTemplate = (empl) => html`
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
    <div>${employeeNameTemplate(item['Employee'])}</div>
    <div>
      ${shiftTimeTemplate(item['StartDate'])}${optionalDate}
    </div>
    <div>${shiftTimeTemplate(item['EndDate'])}</div>
    <div class="total">${formatDuration((item['EndDate'] || now) - item['StartDate'])}</div>
  `;
});
 
const template = (data, status) => html`
  <header>${summaryTemplate(data.now, data.lastPoll, data.nextPoll)}</header>
  <div class="table">
    ${headerTemplate}
    ${rowsTemplate(data.filteredShifts, data.now)}
  </div>
  <div class="status">
    <p>${status.message}</p>
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

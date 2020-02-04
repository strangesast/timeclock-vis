declare const DEV: string;

import { socket } from './socket';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  interval,
  range,
  merge,
  timer,
} from 'rxjs';
import {
  concat,
  flatMap,
  finalize,
  first,
  repeat,
  retryWhen,
  ignoreElements,
  map,
  share,
  startWith,
  switchMap,
  takeUntil,
  tap,
  zip,
} from 'rxjs/operators';

import { formatDate, sortBy } from './util';

let getDataSource: () => Observable<DataSlice>;

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

if (DEV == 'production') {
  getDataSource = () => {
    const statusSource = new BehaviorSubject<{message: string}>({
      message: 'Waiting for connection',
    });
    const SOCKET_URL = `ws://${window.location.host}/socket`;
    const RECENT_THRESHOLD = 3.6e6 * 2 // 2 hours
    const dataSource = socket(SOCKET_URL).pipe(
      tap(stream => {
        // connected, waiting on data
        statusSource.next({message: 'Got connection! Waiting for data.'});
      }),
      retryWhen(attempts => {
        const attemptStart = new Date();
        return range(1, 1e5).pipe(
          zip(attempts),
          flatMap(([attemptNumber, err]) => {
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
          })
        );
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

export {getDataSource};

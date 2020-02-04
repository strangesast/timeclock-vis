declare const DEV: boolean;

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

// connect to websocket endpoint
// retry on interval if unsuccessful / on failure
// format data a bit (TODO: do this on the server side)
// create formatted messages for what is happening
// periodically update display as time passes (1s interval)

if (!DEV) {
  getDataSource = () => {
    const statusSource = new BehaviorSubject<{message: string}>({
      message: 'Waiting for connection',
    });
    const SOCKET_URL = `ws://${window.location.host}/socket`;
    const RECENT_THRESHOLD = 3.6e6 * 2 // 2 hours
    const dataSource = socket(SOCKET_URL).pipe(
      tap(stream => {
        // connected, waiting on data.  called for every new stream (socket connection)
        statusSource.next({message: 'Got connection! Waiting for data.'});
      }),
      retryWhen(attempts => {
        // called on failure / disconnect.  attempts is a stream of errors

        const attemptStart = new Date(); // store when disconnect first happened
        const RETRY_INTERVAL = 1e5; // retry every 10s
        const RETRY_UPDATE_INTERVAL = 1000; // update message every 1s

        // called 100,000 times once per retry interval. ~1 day of retrying
        return range(1, 1e5).pipe(
          zip(attempts),
          flatMap(([attemptNumber, err]) => {
            let now = new Date();
            const nextRetryDate = new Date(+now + RETRY_INTERVAL);
            const msg = (num, ms) => `Connection failed: Attempt ${num}, retrying in ${(ms / 1000).toFixed(0)}s. Retrying since ${formatDate(attemptStart)}`;
            statusSource.next({ message: msg(attemptNumber, RETRY_INTERVAL) });
            const t = timer(RETRY_INTERVAL).pipe(share()); // countdown until next retry
            return merge(
              interval(RETRY_UPDATE_INTERVAL).pipe(
                tap(() => {
                  // reuse now var
                  now = new Date();
                  // update retry text
                  statusSource.next({message: msg(attemptNumber, Math.round(+nextRetryDate - +now))});
                }),
                takeUntil(t),
                ignoreElements()
              ),
              // after retry countdown complete, notify of attempt
              t.pipe(finalize(() => {
                statusSource.next({message: `Retrying...`});
              })),
            );
          })
        );
      }),
      // need to share so messages in switchMap can get first
      share(),
      switchMap(messages =>
        merge(
          // after just the first message, notify of normal state. notify when
          // normal state reached, then resume normal text
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
      // after completion (connection lost with error or otherwise) start from the beginning
      repeat(),
      // for each data, change the data format a bit (interpret dates & so on) TODO: move this elsewhere
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
    // merge the data data update & status update observables into one observable
    return combineLatest(dataSource, statusSource, (data, status) => ({ data, status }))
  }
} else {
  // generate some fake data for development
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

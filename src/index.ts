import { merge, Observable, interval, range, timer } from 'rxjs';
import { repeat, takeUntil, first, ignoreElements, share, zip, flatMap, tap, finalize, retryWhen, switchMap } from 'rxjs/operators';
import { html, render } from 'lit-html';

import { socket } from './socket';

const SOCKET_URL = `ws://${window.location.host}/socket`;

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
).subscribe(
  val => console.log('val', val),
  err => console.log('error', err),
  () => console.log('complete'),
);

const template = status => html`<p>Status is</p><pre>${JSON.stringify(status, null, 2)}</pre>`;

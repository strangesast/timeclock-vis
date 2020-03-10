import { of, combineLatest, BehaviorSubject, empty, merge, Observable, interval, range, timer } from 'rxjs';
import { concat, map, startWith, repeat, takeUntil, first, ignoreElements, share, zip, flatMap, tap, finalize, retryWhen, switchMap } from 'rxjs/operators';
import { html, render } from 'lit-html';
import { repeat as templateRepeat } from 'lit-html/directives/repeat';

import { getDataSource } from './data-source';
import { formatDuration, formatTime } from './util';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

declare const DEV: boolean;
console.log(`Running in DEVELOPMENT? ${DEV ? 'yes' : 'no'}`);

// connect to socket, repeat after disconnect, retry after failure
getDataSource().subscribe(
  ({data, status}) => {
    render(template(data, status), document.body);
  },
  err => console.log('error', err),
  () => console.log('complete'),
);

const summaryTemplate = (now, lastPoll, nextPoll) => {
  const asOf = formatTime(lastPoll);
  const notToday = lastPoll.getDate() != now.getDate();
  // if lastPoll was yesterday (or earlier) include the date next to the time
  const ifDiffDay = notToday ? ` (${lastPoll.getMonth() + 1}/${('0' + lastPoll.getDate()).slice(-2)})` : '';

  return html`
    <div>${formatTime(now, true)}</div>
    <div>As of ${asOf}${ifDiffDay}</div>
    <div>Next update: ${formatTime(nextPoll)}${nextPoll < now ? ' (LATE)' : ''}</div>
  `;
}

const headerTemplate = html`
  <div>Name</div>
  <div>Clock In</div>
  <div>Clock Out</div>
  <div class="total">Total</div>
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

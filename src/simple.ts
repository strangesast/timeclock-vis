import * as d3 from 'd3';
import { getData, ShiftState } from './data';
import * as Comlink from 'comlink';

const worker = new Worker('./data.worker.ts', { type: 'module' });
const obj = Comlink.wrap(worker) as any;

// worker.postMessage('toast');

document.addEventListener('DOMContentLoaded', async () => {
  main();
});

const colors = {
    lightBlue: '#cfe2f3',
    darkBlue: '#6fa8dc',
    lightGreen: '#93c47d',
};

function main() {
  const now = new Date(2020, 0, 3, 12, 0, 0, 0);
  let data = getData(now);

  const svg = d3.select('svg');

  const {width, height} = (svg.node() as any).getBoundingClientRect();

  const recordHeight = 40;

  const firstDateRange = centerOnDate(now);

  const zoom = d3.zoom().on('zoom', zoomed);
  let timeScale = d3.scaleTime()
    .range([0, width])
    .domain(firstDateRange);

  const timeScaleCopy = timeScale.copy();

  let timeAxis = d3.axisTop(timeScale);

  svg.append('g').classed('x', true)
    .call(timeAxis)
    .attr('transform', `translate(0,${recordHeight})`);

  svg.append('g')
    .classed('records', true)
    .attr('transform', `translate(0,${recordHeight})`)

  function redraw(data: {
    shift: {
      state: ShiftState,
      actual: {start: Date, end: Date|null},
      typical: {start: Date, end: Date},
    },
    employee: {
      name: {first: string, last: string}
    },
  }[]) {
    svg.select('g.records')
      .selectAll('.record')
      .data(data, (d: any) => d.id)
      .join(
        enter => enter.append('g')
          .classed('record', true)
          .call(s => {
            s.append('rect')
              .classed('fg', true)
              .attr('height', recordHeight)
              .append('title').text(d => d.employee.name.first + ' ' + d.employee.name.last)
            s.append('text')
              .attr('y', recordHeight / 2)
              .classed('name', true)
              .text(d => d.employee.name.first + ' ' + d.employee.name.last)
            s.append('text')
              .attr('y', recordHeight / 2)
              .classed('time start', true)
              .text(d => formatTime(d.shift.state === ShiftState.Upcoming ? d.shift.typical.start : d.shift.actual.start));
            s.append('text')
              .attr('y', recordHeight / 2)
              .classed('time end', true)
              .text(d => formatTime(d.shift.state === ShiftState.Complete ? d.shift.actual.end : d.shift.typical.end));
            return s;
          }),
        update => update,
        exit => exit.remove(),
      )
      .each(fn);

  }

  let debounce;
  function zoomed() {
    timeScale = d3.event.transform.rescaleX(timeScaleCopy);
    timeAxis = timeAxis.scale(timeScale);
    const [a, b] = timeAxis.scale().domain().map(d => (d as Date).toISOString());

    svg.select('g.x').call(timeAxis);
    svg.select('g.records').selectAll('g.record').each(fn);

    (([a, b]) => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        data = await obj.getData([a, b]);
        redraw(data);
      }, 500);
    })(timeAxis.scale().domain().map(d => (d as Date)));

  }

  function fn(d, i) {
    const { state, actual, typical } = d.shift;
    switch (state) {
      case ShiftState.InProgress: {
        const [x, x0] = [timeScale(actual.start), timeScale(now)];
        const x1 = timeScale(typical.end);
        d.pos.x = x;
        d.pos.y = 2 + d.pos.yi * (recordHeight + 2);
        d.pos.w = Math.max(x0 - x, 0); // disgusting
        d.pos.w1 = Math.max(x1 - x, 0);
        break;
      }
      case ShiftState.Complete: {
        const [x, x0] = [timeScale(actual.start), timeScale(actual.end)];
        d.pos.x = x;
        d.pos.y = 2 + d.pos.yi * (recordHeight + 2);
        d.pos.w = x0 - x;
        break;
      }
      case ShiftState.Upcoming: {
        const [x, x0] = [timeScale(typical.start), timeScale(typical.end)];
        d.pos.x = x;
        d.pos.y = 2 + d.pos.yi * (recordHeight + 2);
        d.pos.w = x0 - x;
        break;
      }
    }
    const sel = d3.select(this);
    sel.select('text.name')
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .attr('transform', (d: any) => `translate(${d.pos.x + (d.shift.state === ShiftState.InProgress ? d.pos.w1 : d.pos.w) / 2},${d.pos.y})`);
    sel.select('text.time.start')
      .attr('text-anchor', 'start')
      .attr('alignment-baseline', 'middle')
      .attr('transform', (d: any) => `translate(${d.pos.x},${d.pos.y})`);
    sel.select('text.time.end')
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .attr('transform', (d: any) => `translate(${d.pos.x + (d.shift.state === ShiftState.InProgress ? d.pos.w1 : d.pos.w)},${d.pos.y})`);
    sel.select('rect.fg')
      .attr('fill', (d: any) => d.shift.state !== ShiftState.Upcoming ? colors.darkBlue: colors.lightBlue)
      .attr('transform', (d: any) => `translate(${d.pos.x},${d.pos.y})`)
      .attr('width', (d: any) => d.pos.w);
    sel.filter((d: any) => d.shift.state === ShiftState.InProgress).append('rect')
      .attr('height', recordHeight).classed('bg', true);
    sel.select('rect.bg')
      .attr('fill', colors.lightBlue)
      .attr('transform', (d: any) => `translate(${d.pos.x},${d.pos.y})`)
      .attr('width', (d: any) => d.pos.w1)
      .lower()
  }

  obj.getData(firstDateRange).then(data => redraw(data));

  svg.call(zoom);

  // const s = g.selectAll('.record').data(data, (d: any) => d.id)
  //   .join(
  //     enter => enter.append('g'),
  //     update => update.call(sel => sel.select('g.fg')),
  //     exit => exit.remove(),
  //   );


  // complete
  // upcoming
  // inprogress

  // handle scale changes (linear, log)

  // handle zooming

  // handle more / different data
  //    different zoom region
  //    time passing
}

function formatTime(d: Date): string {
  return `${d.getHours() || 12}:${('0' + d.getMinutes()).slice(-2)}`;
}


function centerOnDate(date: Date, hoursWidth = 8): [Date, Date] {
  return [addHours(date, -hoursWidth / 2), addHours(date, hoursWidth / 2)];
}

function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}


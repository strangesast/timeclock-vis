import * as d3 from 'd3';
import * as Comlink from 'comlink';

import { Shift, ShiftState, throttle, debounce, addHours, formatTime } from './util';

const worker = Comlink.wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;

document.addEventListener('DOMContentLoaded', async () => {
  main();
});

const colors = {
    lightBlue: '#cfe2f3',
    darkBlue: '#6fa8dc',
    lightGreen: '#93c47d',
};

function main() {
  let data;
  let width, height;

  const svg = d3.select('svg');

  ({width, height} = (svg.node() as any).getBoundingClientRect());

  const headerHeight = 40;

  const now = new Date(2020, 0, 3, 12, 0, 0, 0);
  const firstDateRange = centerOnDate(now);

  const zoom = d3.zoom()
    .on('zoom', zoomed);

  let timeScale = d3.scaleTime()
    .range([0, width])
    .domain(firstDateRange);

  let bandScale = d3.scaleBand()
    .range([headerHeight, height])
    .padding(0.1);

  // const dayAxisOffset = (sel) => {
  //   const d = new Date();
  //   const offset = (timeScale(d3.timeDay.offset(d, 1)) - timeScale(d)) / 2;
  //   return sel.selectAll('text').attr('transform', `translate(${offset},0)`);
  // };

  const timeScaleCopy = timeScale.copy();

  let timeAxis = d3.axisTop(timeScale);

  svg.append('g').classed('x time', true)
    .call(timeAxis)
    .attr('transform', `translate(0,${headerHeight})`);

  // const dayAxis = (sel) => {
  //   sel.selectAll('text').data();
  // };

  // svg.append('g').classed('x day', true)
  //   .call(dayAxis)
  //   .attr('transform', `translate(0,${headerHeight / 2})`);

  svg.append('g').classed('days', true);
  svg.append('g').classed('records', true);

  function updateViewWidth() {
    ({width, height} = (svg.node() as any).getBoundingClientRect());
    timeScale.range([0, width]);
    // bandScale.range([0, height]);
    svg.select('g.x.time').call(timeAxis);
    // svg.select('g.x.day').call(dayAxis).call(dayAxisOffset);
    redraw(data);
  }

  window.onresize = debounce(() => updateViewWidth(), 200);

  function redraw({shifts, employeeIds}: {shifts: Shift[], employeeIds: string[]}) {
    bandScale.domain(employeeIds).padding(0.1)

    svg.select('g.records')
      .selectAll('.record')
      .data(shifts, (d: any) => d.id)
      .join(
        enter => enter.append('g')
          .classed('record', true)
          .call(s => {
            s.append('rect')
              .classed('fg', true)
              .attr('height', bandScale.bandwidth())
              .append('title')
              .text(d => d.display.center)
            s.append('text')
              .attr('y', bandScale.bandwidth() / 2)
              .classed('name', true)
              .text(d => d.display.center)
            s.append('text')
              .attr('y', bandScale.bandwidth() / 2)
              .classed('time start', true)
              .text(d => d.display.left);
            s.append('text')
              .attr('y', bandScale.bandwidth() / 2)
              .classed('time end', true)
              .text(d => d.display.right);
          }),
        update => update,
        exit => exit.remove(),
      )
      .each(updatePos)
      .call(updateSel);
  }

  const throttledUpdate = throttle(
    async ([fromDate, toDate]) => worker.getData([fromDate, toDate]),
    newData => redraw(data = newData),
  );

  function zoomed() {
    timeScale = d3.event.transform.rescaleX(timeScaleCopy);
    timeAxis = timeAxis.scale(timeScale);
    //dayAxis = dayAxis.scale(timeScale);

    svg.select('g.x.time')
      .call(timeAxis);

    // svg.select('g.x.day')
    //   .call(dayAxis).call(dayAxisOffset);;

    svg.select('g.records').selectAll('g.record')
      .each(updatePos)
      .call(updateSel);

    const domain = timeAxis.scale().domain().map(d => (d as Date));
    throttledUpdate(domain);
  }

  function updatePos(d, i) {
    const { state, actual, typical } = d.shift;
    switch (state) {
      case ShiftState.InProgress: {
        const [x, x0] = [timeScale(actual.start), timeScale(now)];
        const x1 = timeScale(typical.end);
        d.pos.x = x;
        d.pos.y = bandScale(d.employee.id);
        d.pos.w = Math.max(x0 - x, 0); // disgusting
        d.pos.w1 = Math.max(x1 - x, 0);
        break;
      }
      case ShiftState.Complete: {
        const [x, x0] = [timeScale(actual.start), timeScale(actual.end)];
        d.pos.x = x;
        d.pos.y = bandScale(d.employee.id);
        d.pos.w = x0 - x;
        break;
      }
      case ShiftState.Upcoming: {
        const [x, x0] = [timeScale(typical.start), timeScale(typical.end)];
        d.pos.x = x;
        d.pos.y = bandScale(d.employee.id);
        d.pos.w = x0 - x;
        break;
      }
    }
  }

  function updateSel(sel) {
    sel.select('text.name')
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .attr('transform', (d: any) =>
        `translate(${Math.min(Math.max(d.pos.x + (d.shift.state === ShiftState.InProgress ? d.pos.w1 : d.pos.w) / 2, 80), width - 80)},${d.pos.y})`);
    sel.select('text.time.start')
      .attr('text-anchor', 'start')
      .attr('alignment-baseline', 'middle')
      .attr('transform', (d: any) => `translate(${d.pos.x},${d.pos.y})`);
    sel.selectAll('text').attr('y', bandScale.bandwidth() / 2);
    sel.select('text.time.end')
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .attr('transform', (d: any) => `translate(${d.pos.x + (d.shift.state === ShiftState.InProgress ? d.pos.w1 : d.pos.w)},${d.pos.y})`);
    sel.select('rect.fg')
      .attr('fill', (d: any) => d.shift.state !== ShiftState.Upcoming ? colors.darkBlue: colors.lightBlue)
      .attr('transform', (d: any) => `translate(${d.pos.x},${d.pos.y})`)
      .attr('height', bandScale.bandwidth())
      .attr('width', (d: any) => d.pos.w);
    sel.filter((d: any) => d.shift.state === ShiftState.InProgress).append('rect')
      .attr('height', bandScale.bandwidth()).classed('bg', true);
    sel.select('rect.bg')
      .attr('fill', colors.lightBlue)
      .attr('transform', (d: any) => `translate(${d.pos.x},${d.pos.y})`)
      .attr('width', (d: any) => d.pos.w1)
      .attr('height', bandScale.bandwidth())
      .lower()
  }

  worker.getData(firstDateRange).then(newData => redraw(data = newData));

  svg.call(zoom);
}


function centerOnDate(date: Date, hoursWidth = 8): [Date, Date] {
  return [addHours(date, -hoursWidth / 2), addHours(date, hoursWidth / 2)];
}

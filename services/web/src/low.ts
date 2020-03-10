import * as d3 from 'd3';
import { Subject } from 'rxjs';
import * as Comlink from 'comlink';
import { switchMap, map, throttleTime } from 'rxjs/operators';
import { socket } from './socket';

import { Employee, ShiftComponent, Shift, ShiftComponentType, EmployeeShiftColor, ShiftState } from './models';
import { employeeColorScale, formatDuration, formatTime, formatDateWeekday } from './util';

declare const GENERATE_MOCKING: boolean;
declare const NODE_ENV: string;
const worker = Comlink.wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;

let now: Date;
const START_MIN_WIDTH_THRESHOLD = 50;
const END_MIN_WIDTH_THRESHOLD = 100;

const rowStep = 70;
const rowTextHeight = 12;
const rectHeight = 40;

const body = d3.select(document.body).call(s => s.append('svg'));

async function main() {
  if (GENERATE_MOCKING) {
    now = d3.timeWeek.floor(new Date());
    now.setDate(now.getDate() + 3);
    now.setHours(14, 22, 0, 0);
  
    await worker.initializeData(now);
  } else {
    now = new Date();
  }
  await byTime(now);
}

async function byTime(date: Date) {
  const margin = {top: 80, left: 10, right: 10, bottom: 10};
  const {innerWidth: width, innerHeight: height} = window;

  const axisLabelHeight = 30;
  const resolution = 30 / 3600000; // 30 pixels per hour
  const domainWidth = width / resolution;
  const targetDomainWidth = 20 * 7 * 24 * 60 * 60 * 1000; // two weeks
  const totalWidth = targetDomainWidth * resolution;
  const dim = [totalWidth, height];

  const rowCount = 12;
  const contentHeight = rowCount * rowStep + margin.top + margin.bottom + axisLabelHeight;

  const d0 = new Date(+date - domainWidth / 2);
  const d1 = new Date(+date + domainWidth / 2);
  const initialDomain = [d0, d1];

  const x0 = totalWidth / 2 - width / 2;
  const x1 = x0 + width;
  
  const xScale = d3.scaleTime().range([x0, x1]).domain(initialDomain);

  // set to whole svg width for axis
  const fullRange = [0, totalWidth];
  const fullDomain = [xScale.invert(0), xScale.invert(totalWidth)];
  xScale.range(fullRange).domain(fullDomain);

  const svg = body.select('svg');

  drawTopAxis(svg, xScale, contentHeight - margin.bottom - margin.top - axisLabelHeight);
  drawBottomAxis(svg, xScale, contentHeight - axisLabelHeight - margin.bottom);
  drawDateAxis(svg, xScale);

  if (body.select('header').empty()) {
    body.append('header').append('button')
      .call(s => s.text('Reset'))
  }
  body.select('header').select('button')
    .on('click', d => {
      window.scrollTo({...args, left: xScale(now) - width / 2, behavior: 'smooth'});
    })

  if (body.select('svg').select('g.shifts').empty()) {
    body.select('svg').append('g').classed('shifts', true);
  }
  svg.attr('width', totalWidth).attr('height', height);

  const redraw = new Subject();
  redraw.pipe(
    throttleTime(100),
    map(([x0, w]) => [xScale.invert(x0), xScale.invert(x0 + w)]),
    switchMap(domain => worker.getShiftsInRange(domain)),
  ).subscribe((data: any) => {
    const dim: [number, number] = [totalWidth, contentHeight];
    data.shifts.forEach(updatePositions);
    draw(data, dim);
  });

  const updatePositions = (shift: Shift) => {
    for (const comp of shift.components) {
      const index = comp.type == ShiftComponentType.Projected ? 1 : 0;
      comp.fill = d3.color(employeeColorScale(shift.employeeColor.toString())[index]);
      comp.x = xScale(comp.start);
      comp.w = Math.max(xScale(comp.end) - comp.x, 0);
    }
    shift.y = shift.row * rowStep + margin.top + axisLabelHeight;
    const [a, b] = [shift.start, shift.end || now].map(xScale);
    shift.x = Math.min(Math.max(a, 0), b);
    if (isNaN(shift.y)) {
      console.log(shift);
    }
    return shift;
  }

  function draw({shifts, employees}:{shifts: Shift[], employees: {[id: string]: Employee}}, [w, h]: [number, number]) {
    body.select('svg').attr('width', w).attr('height', h).select('g.shifts').raise().selectAll('g.shift').data(shifts, d => d['_id']).join(
      enter => enter.append('g').classed('shift time', true).attr('transform', d => `translate(0,${d.y})`)
        .call(s => s.append('g').classed('text', true).attr('transform', d => `translate(${d.x},${-rowTextHeight})`)
          .call(s => s.append('text').classed('name', true).text(d => formatName(employees[d.employee])))
          .each(function (d) {
            const s = d3.select(this);
            const dx = (this.firstChild as SVGGraphicsElement).getBBox().width + 4;
            s.append('g')
              .attr('transform', `translate(${dx},0)`)
              .call(drawMiniPie, d.duration / d.expectedDuration, d.employeeColor)
              .call(s => s.append('text').attr('y', 5).attr('x', 24).text(formatDuration(d.duration)))
          })
        )
        .call(s => s.selectAll('g.component').data(d => d.components).enter()
          .append('g').classed('component', true)
          .attr('transform', d => `translate(${d.x},0)`)
          .call(s => s.append('title').text(d => `${formatTime(d.start)}-${formatTime(d.end)}`))
          .call(s => s.append('rect')
            .attr('rx', 8)
            .attr('ry', 8)
            .attr('width', d => d.w)
            .attr('height', rectHeight)
            .attr('fill', d => d.fill.toString()))
          .each(filterShiftComponentTimeVisibility)
        ).on('click', d => {
          cleanup();
          byEmployee(d.employee, d.start);
        }),
      update => update,
      exit => exit.remove(),
    )
      .call(s =>
        s.filter(d => d.state == ShiftState.Incomplete).selectAll('g.component').data(d => d.components).join(
          enter => enter.append('g').classed('component', true),
          update => update,
          exit => exit.remove()
        ).attr('transform', d => `translate(${d.x},0)`)
      )
  }

  const onScroll = () => redraw.next([window.scrollX, window.innerWidth]);
  const onBeforeUnload = () => window.scrollTo(args);

  window.addEventListener('scroll', onScroll);
  window.addEventListener('beforeunload', onBeforeUnload);

  let args = {left: xScale(initialDomain[0]), top: 0, behavior: 'auto' as ScrollBehavior};
  window.scrollTo(args);

  const cleanup = () => {
    svg.select('g.axis.top').remove()
    svg.select('g.axis.bottom').remove()
    svg.select('g.axis.date').remove()
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };

  function drawTopAxis(sel, scale, h) {
    if (sel.select('g.axis.top').empty()) {
      sel.append('g').classed('axis top', true);
    }
    return sel.select('g.axis.top')
      .attr('transform', `translate(0,${margin.top})`)
      .call(d3.axisTop(scale).ticks(d3.timeHour.every(3)))
      .call(s => s.select('path').remove())
      .call(s => s.selectAll('.tick').select('line')
        .attr('y2', h)
      );
  }
  
  function drawBottomAxis(sel, scale, h) {
    if (sel.select('g.axis.bottom').empty()) {
      sel.append('g').classed('axis bottom', true);
    }
  
    return sel.select('g.axis.bottom')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(scale).ticks(d3.timeHour.every(3)))
      .call(s => s.select('path').remove())
      .call(s => s.selectAll('.tick').select('line').remove());
  }
  
  
  function drawDateAxis(sel, scale) {
    if (sel.select('g.axis.date').empty()) {
      sel.append('g').classed('axis date', true);
    }
    const days = [];
    const [minDate, maxDate] = scale.domain();
    let d = d3.timeDay.floor(minDate)
    while (d < maxDate) {
      days.push(d3.timeHour.offset(d, 12));
      d = d3.timeDay.offset(d, 1)
    }
    sel.select('g.axis.date').attr('transform', `translate(0,${48})`).selectAll('g.label').data(days, d => d.toISOString().slice(0, 10)).join(
      enter => enter.append('g').classed('label', true)
        .attr('transform', d => `translate(${scale(d)},0)`)
        .call(s => s.append('text')
          .attr('text-anchor', 'middle')
          .attr('alignment-baseline', 'middle')
          .text(d => formatDateWeekday(d))
        ),
      update => update.attr('transform', d => `translate(${scale(d)},0)`),
      exit => exit.remove(),
    );
  }
}

function byEmployee(employeeId: string, date = new Date()) {
  const margin = {top: 80, left: 80, right: 10, bottom: 10};
  const {innerWidth: width, innerHeight: height} = window;

  const domainHeight = height / rowStep * 8.64e7;
  const d0 = new Date(+date - domainHeight / 2);
  const d1 = new Date(+date + domainHeight / 2);

  const totalHeight = rowStep * 20 * 7;
  const dim = [width, totalHeight];

  const yScale = d3.scaleTime().domain([d0, d1]).range([totalHeight / 2 - height / 2, totalHeight / 2 + height / 2]);
  const xScale = d3.scaleTime().range([margin.left, width - margin.right]);

  const fullRange = [0, totalHeight];
  const fullDomain = [yScale.invert(0), yScale.invert(totalHeight)];
  yScale.range(fullRange).domain(fullDomain);

  const svg = body.select('svg');
  svg.attr('width', width).attr('height', totalHeight);

  if (svg.select('g.axis.left').empty()) {
    svg.append('g').classed('axis left', true);
  }
  svg.select('g.axis.left')
    .attr('transform', `translate(${64},0)`)
    .call(d3.axisLeft(yScale).ticks(d3.timeWeek.every(1)))

  if (body.select('header').empty()) {
    body.append('header').append('button').text('Reset');
  }
  body.select('header').select('button').on('click', () => {
    window.scrollTo({...args, top: yScale(d3.timeWeek.floor(now)), behavior: 'smooth'});
  });
  if (body.select('svg').select('g.shifts').empty()) {
    body.select('svg').append('g').classed('shifts', true);
  }

  const redraw = new Subject();
  redraw.pipe(
    throttleTime(100),
    map(([y0, h]) => [yScale.invert(y0), yScale.invert(y0 + h)]),
    switchMap(domain => worker.getShiftsByEmployeeInRange(employeeId, domain)),
  ).subscribe((data: any) => {
    const [minTime, maxTime] = d3.extent(data.shifts
      .reduce((acc, s) => {
        calculateNorms(s);
        for (const comp of s.components) {
          acc.push(comp.startNorm);
          acc.push(comp.endNorm);
        }
        return acc;
      }, [] as Date[])) as [Date, Date];
    xScale.domain([minTime, maxTime]);

    data.shifts.forEach(updatePositions);
    draw(data, dim);
  });

  const updatePositions = (shift: Shift) => {
    calculateNorms(shift);
    for (const comp of shift.components) {
      const index = comp.type == ShiftComponentType.Projected ? 1 : 0;
      comp.fill = d3.color(employeeColorScale(shift.employeeColor.toString())[index]);
      comp.x = xScale(comp.startNorm);
      comp.w = Math.max(xScale(comp.endNorm) - comp.x, 0);
    }
    shift.y = yScale(d3.timeDay.floor(shift.start));
    shift.x = Math.max(xScale(shift.startNorm), 0);
    return shift;
  }

  function draw({shifts, employees}: {shifts: Shift[], employees: {[id: string]: Employee}}, [w, h]: number[]) {
    svg.attr('width', w).attr('height', h).select('g.shifts').raise().selectAll('g.shift').data(shifts, d => d['_id']).join(
      enter => enter.append('g').classed('shift employee', true)
        .attr('transform', d => `translate(0,${d.y})`)
        .call(s => s.append('g').classed('text', true)
          .attr('transform', d => `translate(${d.x},${-rowTextHeight})`)
          .call(s => s.append('text').classed('name', true).text(d => formatDateWeekday(d.start)))
          .each(function (d) {
            const s = d3.select(this);
            const dx = (this.firstChild as SVGGraphicsElement).getBBox().width + 4;
            s.append('g')
              .attr('transform', `translate(${dx},0)`)
              .call(drawMiniPie, d.duration / d.expectedDuration, d.employeeColor)
              .call(s => s.append('text').attr('y', 5).attr('x', 24).text(formatDuration(d.duration)))
          })
        )
        .call(s => s.selectAll('g.component').data(d => d.components).enter()
          .append('g').classed('component', true)
          .attr('transform', d => `translate(${d.x},0)`)
          .call(s => s.append('title').text(d => `${formatTime(d.start)}-${formatTime(d.end)}`))
          .call(s => s.append('rect')
            .attr('rx', 8)
            .attr('ry', 8)
            .attr('width', d => d.w)
            .attr('height', rectHeight)
            .attr('fill', d => d.fill.toString()))
          .each(filterShiftComponentTimeVisibility)
        ).on('click', d => {
          cleanup();
          byTime(d.start);
        }),
      update => update
        .call(s => s.select('g.text').attr('transform', d => `translate(${d.x},${-rowTextHeight})`))
        .call(s => s.selectAll('g.component').data(d => d.components)
          .attr('transform', d => `translate(${d.x},0)`)
          .call(s => s.select('title').text(d => `${formatTime(d.start)}-${formatTime(d.end)}`))
          .call(s => s.select('rect').attr('width', d => d.w))
          .each(filterShiftComponentTimeVisibility)),
      exit => exit.remove(),
    )
  }

  const onScroll = () => redraw.next([window.scrollY, window.innerHeight]);
  const onBeforeUnload = () => window.scrollTo(args);

  window.addEventListener('scroll', onScroll);
  window.addEventListener('beforeunload', onBeforeUnload);

  let args = {left: 0, top: yScale(d3.timeWeek.floor(date)), behavior: 'auto' as ScrollBehavior};
  window.scrollTo(args);

  const cleanup = () => {
    svg.select('g.axis.left').remove();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}


function calculateNorms(shift: Shift) {
  let date, offset;
  const first = shift.components.length > 0 ? shift.components[0].start : null;
  date = new Date(shift.start);
  date.setFullYear(2000);
  date.setMonth(0);
  date.setDate(1);
  shift.startNorm = date;
  for (const comp of shift.components) {
    date = new Date(comp.start);
    offset = d3.timeDay.count(first, date);
    date.setFullYear(2000);
    date.setMonth(0)
    date.setDate(1 + offset);
    comp.startNorm = date;

    date = new Date(comp.end);
    offset = d3.timeDay.count(first, date);
    date.setFullYear(2000);
    date.setMonth(0)
    date.setDate(1 + offset);
    comp.endNorm = date;
  }
}

const arc = d3.arc();
function drawMiniPie(s, frac: number, employeeColor: EmployeeShiftColor, radius = 10) {
  const endAngle = 2 * Math.PI * Math.min(Math.max(frac, 0), 1);
  const startAngle = 0;
  if (s.select('g.pie').empty()) {
    const c = employeeColorScale(employeeColor.toString());
    s = s.append('g').classed('pie', true).attr('transform', `translate(${radius},0)`)
      .call(s => s.append('circle').attr('r', 10).attr('fill', c[1]))
      .call(s => s.append('path').attr('fill', c[0]));
  }
  return s.call(s => s.select('path').attr('d', arc({ startAngle, endAngle, outerRadius: radius, innerRadius: 0 })))
}

function filterShiftComponentTimeVisibility (d: ShiftComponent) {
  const data = [
    {'class': 'start', x: 4, 'opacity': d.showTime && d.w > START_MIN_WIDTH_THRESHOLD ? 1 : 0, text: formatTime(d.start)},
    {'class': 'end', x: d.w - 4, 'opacity': d.showTime && d.w > END_MIN_WIDTH_THRESHOLD ? 1 : 0, text: formatTime(d.end)},
  ];
  return d3.select(this).selectAll('text.time').data(data, d => d['class']).join(
    enter => enter.append('text').attr('class', d => `${d['class']} time`).attr('y', rectHeight / 2),
    update => update,
    exit => exit.remove()
  )
    .attr('x', d => d.x)
    .attr('opacity', d => d.opacity)
    .text(d => d.text);
}

const formatName = (empl: Employee) => `${empl.Name} ${empl.LastName}`;
const formatTransform = ([x, y]: [number, number]) => {
  if (isNaN(y)) {
    throw new Error('wahtt');
  }
  return `translate(${x},${y})`;
}
const data = {
  shifts: [],
  employeeIds: [],
  employees: {},
};


const smooth = false;
document.addEventListener('DOMContentLoaded', async () => {
  await main();
});


const SOCKET_URL = `ws://${window.location.host}/socket`;
socket(SOCKET_URL).pipe(switchMap(v => v)).subscribe(val => console.log(val));

import * as d3 from 'd3';
import { formatDuration, formatTime } from './util';
const LOCALE = 'en';

const svg : d3.Selection<SVGElement, {}, HTMLElement, any> = d3.select('svg');

enum EmployeeShiftColor {
  BLUE,
  GREEN,
  RED,
  ORANGE,
  PINK,
}

const EMPLOYEE_SHIFT_COLORS = Object.values(EmployeeShiftColor).filter(v => typeof v === 'string');

interface Employee {
  id: string;
  name: string;
  shift: {
    start: Date;
    end: Date;
    duration: number;
  };
  color: EmployeeShiftColor;
}


enum ShiftState {
  Complete = 'complete',
  Incomplete = 'incomplete',
}

enum ShiftComponentType {
  Actual = 'actual',
  Projected = 'projected',
}

interface BaseShiftComponent {
  x: number;
  w: number;
  fill: d3.Color;
  start: Date;
  end: Date;
  duration: number;
  showTime: boolean;
  employeeId: string; // needed for fill (gay)
}

interface ProjectedShiftComponent extends BaseShiftComponent {
  type: ShiftComponentType.Projected;
}

interface ActualShiftComponent extends BaseShiftComponent {
  type: ShiftComponentType.Actual;
  state: ShiftState;
}

type ShiftComponent = ProjectedShiftComponent|ActualShiftComponent;

interface Shift {
  id: string;
  employee: {
    id: string;
    name: string;
  }
  start: Date; // start of first component (actual or projected)
  end: Date; // end of last component (actual or projected)
  duration: number; // total so far
  expectedDuration: number;
  components: ShiftComponent[];
  punches: {
    date: Date
  }[],
  started: boolean;
  y: number;
  x: number;
}

interface DataSet {
  shifts: Shift[];
  employeeIds: string[];
}

// all shifts
const shifts: Shift[] = [];
// all employees
const employees: Employee[] = [];

const now = new Date();
now.setDate(now.getDate() - now.getDay() + 3);
now.setHours(14, 22);

const today = new Date(now);
today.setHours(0, 0, 0, 0);

let width, height;
let xScale = d3.scaleTime();
let topAxis = d3.axisTop(xScale);
let bottomAxis = d3.axisBottom(xScale);
const yScale = d3.scaleBand().padding(0.6);

const colorScale = d3.scaleOrdinal();
{
  const colors = d3.schemePaired.slice(0, 10);
  const pairs = [];
  for (let i = 0; i < colors.length; i+=2) {
    const pair = [colors[i+1], colors[i]];
    pairs.push(pair);
  }
  colorScale.domain(pairs.map((_, i) => i.toString())).range(pairs);
}

const zoom = d3.zoom().on('zoom', zoomed);


size();

let darkMode = false;

svg.append('rect').classed('background', true).attr('height', '100%').attr('width', '100%');

svg.append('g')
  .classed('button', true)
  .call(g => g.append('rect')
    .attr('rx', 8)
    .attr('width', 240)
    .attr('height', 32)
    .attr('fill', 'grey'))
  .call(g => g.append('text')
    .attr('text-anchor', 'middle')
    .attr('alignment-baseline', 'middle')
    .attr('fill', 'white')
    .attr('x', 120)
    .attr('y', 16)
    .text('Dark Mode')
  )
  .attr('transform', `translate(${width - 244},${4})`)
  .on('click', function() {
    if (darkMode = !darkMode) {
      d3.select(this)
        .call(s => s.select('rect').attr('fill', 'lightgrey'))
        .call(s => s.select('text').attr('fill', 'black'));
      svg.classed('dark', true);
    } else {
      d3.select(this)
        .call(s => s.select('rect').attr('fill', 'grey'))
        .call(s => s.select('text').attr('fill', 'white'));
      svg.classed('dark', false);
    }
  });


svg.append('g').classed('axis top', true).call(topAxis);
svg.append('g').classed('axis bottom', true).call(bottomAxis);
svg.append('g').classed('axis date', true);

const g = svg.append('g');
  
{
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(today);
  start.setHours(4);
  xScale.domain([start, tomorrow]);
}

const xScaleCopy = xScale.copy();

svg.call(zoom);

function size() {
  ({ width, height } = svg.node().getBoundingClientRect());
  xScale.range([0, width]);
  topAxis.scale(xScale);
  bottomAxis.scale(xScale);
  yScale.range([40, height - 40]);
}

function updatePositions(shift: Shift) {
  let x = 0;
  for (let i = shift.components.length - 1; i >= 0; i--) {
    const comp = shift.components[i];
    let fill;
    if (comp.type == ShiftComponentType.Projected) {
      fill = d3.color(colorScale(shift.employee.id)[1]);
    } else {
      fill = d3.color(colorScale(shift.employee.id)[0]);
    }
    x = xScale(comp.start);
    comp.fill = fill;
    comp.x = x;
    comp.w = xScale(comp.end) - comp.x;
  }
  shift.y = yScale(shift.employee.id);
  shift.x = Math.max(xScale(shift.start), 0);
  return shift;
}

function drawAxis() {
  svg.select('g.axis.top').attr('transform', `translate(0,${60})`).call(topAxis)
    .call(s => s.select('path').remove())
    .call(s => s.selectAll('.tick').select('line').attr('y2', height - 60 - 40));
  svg.select('g.axis.bottom').attr('transform', `translate(0,${height - 40})`).call(bottomAxis)
    .call(s => s.select('path').remove())
    .call(s => s.selectAll('.tick').select('line').remove());

  interface DateLabel {
    date: Date;
    id: string;
  }

  const labels: DateLabel[] = [];
  const [minDate, maxDate] = xScale.domain();
  const spacing = xScale(d3.timeDay.offset(minDate, 1)) - xScale(minDate);

  let date = new Date(minDate);
  date.setHours(0, 0, 0, 0);
  const stickyCenter = +maxDate - +minDate < 8.64e7;
  for (; date < maxDate; date.setDate(date.getDate() + 1)) {
    labels.push({ id: date.toISOString().slice(0, 10), date: new Date(date) });
  }

  svg.select('g.axis.date').selectAll<SVGElement, DateLabel>('g').data(labels, d => d.id)
    .join(
      enter => enter.append('g').call(s => s.append('text').classed('date-label', true).text(d => formatDate(d.date))),
      update => update,
      exit => exit.remove(),
    )
    .attr('transform', function (d, i) {
      const {width: w} = (d3.select(this).select('text').node() as SVGGraphicsElement).getBBox();
      const padding = w / 2 + 8;
      let x = xScale(d.date);
      if (stickyCenter) {
        x = Math.min(x + spacing - padding, Math.max(width / 2 - padding, x + padding));
      } else {
        x += spacing / 2 - padding;
      }

      return `translate(${x},${30})`;
    })
}

function main({employeeIds, shifts}: DataSet) {
  yScale.domain(employeeIds);
  shifts.forEach(updatePositions);

  // colorScale.domain(employeeIds);
  // colorScale.range(d3.schemePaired.filter((_, i) => i % 2));

  drawAxis();

  const bandwidth = yScale.bandwidth();

  g.selectAll<SVGElement, Shift>('g.shift').data(shifts, d => d.id)
    .join(
      enter => enter.append('g').classed('shift', true)
        .call(s => s.append('g').classed('text', true)
          .call(s => s.append('text')
            .classed('shift-label', true)
            .attr('y', 10)
            .attr('text-anchor', 'start')
            .attr('alignment-baseline', 'bottom')
            .text(d => d.employee.name)
          )
          .filter(d => d.started)
          .call(s => s.append('g').classed('duration', true)
            .attr('transform', `translate(${s.select<SVGGraphicsElement>('text.shift-label').node().getBBox().width + 4},0)`)
            .each(function (d) {
              const s = d3.select(this);
              const c = colorScale(d.employee.id);
              return drawMiniPie(
                s,
                d.duration / d.expectedDuration,
                c[0],
                c[1],
              );
            })
            .call(s => s.append('text')
              .attr('x', 24)
              .attr('y', 10)
              .attr('alignment-baseline', 'bottom')
              .text(d => `${formatDuration(d.duration)}`)
            ),
          )
        )
        .call(s => s.selectAll('g.group').data(d => d.components).enter().append('g').classed('group', true)
          .call(e => e.append('rect').attr('stroke-width', 4).attr('height', bandwidth).attr('rx', 8))
          .call(s => s.filter(d => d.showTime)
            .call(e => e.append('text')
              .classed('time start', true)
              .attr('alignment-baseline', 'middle')
              .attr('x', 4)
              .attr('y', bandwidth / 2)
              .text(d => formatTime(d.start))
            )
            .call(e => e.append('text')
              .classed('time end', true)
              .attr('text-anchor', 'end')
              .attr('alignment-baseline', 'middle')
              .attr('y', bandwidth / 2)
              .text(d => formatTime(d.end))
            )
          )
          .call(s =>
            s.filter(d => d.type == ShiftComponentType.Actual && d.state == ShiftState.Incomplete)
              .select('rect')
              .append('animate')
              .attr('attributeType', 'XML')
              .attr('attributeName', 'stroke')
              .attr('values', d => {
                const h = d.fill.hex();
                return `${h};#fff;${h}`;
              })
              .attr('dur', '1.2s')
              .attr('repeatCount', 'indefinite')
          )
        )
        .on('click', d => byEmployee(d.employee.id, d.start)),
      update => update,
      exit => exit.remove(),
    )
    .attr('transform', shift => `translate(0,${shift.y})`)
    .call(s => s.select('g.text').attr('transform', d => `translate(${d.x+4},-20)`))
    .call(s => s.selectAll<SVGElement, ShiftComponent>('g.group')
      .attr('transform', d => `translate(${d.x},0)`)
      .call(s => s.select('rect')
        .attr('width', d => d.w)
        .attr('fill', d => d.fill.toString())
        .attr('stroke', d => d.fill.toString())
      )
      .call(s => s.select('text.time.start').attr('opacity', d => d.w > 120 ? 1 : 0))
      .call(s => s.select('text.time.end').attr('opacity', d => d.w > 200 ? 1 : 0).attr('x', d => d.w - 4))
    );
}



function zoomed() {
  xScale = d3.event.transform.rescaleX(xScaleCopy);
  topAxis = topAxis.scale(xScale);
  bottomAxis = bottomAxis.scale(xScale);
  drawAxis();
  
  g.selectAll<SVGElement, Shift>('g.shift')
    .each(updatePositions)
    .attr('transform', shift => `translate(0,${shift.y})`)
    .call(s => s.select('g.text').attr('transform', d => `translate(${d.x + 4},-20)`))
    .call(s => s.selectAll<SVGElement, ShiftComponent>('g.group')
      .attr('transform', d => `translate(${d.x},0)`)
      .call(s => s.select('rect').attr('width', d => d.w))
      .call(s => s.select('text.time.start').attr('opacity', d => d.w > 120 ? 1 : 0))
      .call(s => s.select('text.time.end').attr('opacity', d => d.w > 200 ? 1 : 0).attr('x', d => d.w - 4))
    );
}

function formatDate(date: Date) {
  const a = date.toLocaleDateString(LOCALE, { weekday: 'long' });
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${a} ${m}/${d}`;
}

function setupData(now) {
  const EMPLOYEE_COUNT = 10;

  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    // start hour
    const h = Math.floor((6 + (i / EMPLOYEE_COUNT) * 10) * 2) / 2
    // start hours
    const hh = Math.floor(h);
    // start minutes
    const mm = (h - hh) * 60;
    // start time on Jan 1, 2000
    const start = new Date(2000, 0, 1, Math.floor(h), mm);
    // end time on Jan 1, 2000
    const end = new Date(start);
    end.setHours(end.getHours() + 8, end.getMinutes() + 30); // add 8.5 hours, uh maybe

    const id = `${i}`;
    employees.push({
      id,
      name: `Employee ${i + 1}`,
      shift: { start, end, duration: 2.88e7 },
      color: EmployeeShiftColor[EMPLOYEE_SHIFT_COLORS[i % EMPLOYEE_SHIFT_COLORS.length]],
    });
  }
  
  const days = [];
  let date = new Date(now);
  date.setDate(date.getDate() - date.getDay());
  for (let i = 0; i < 7; i++) {
    days.push(date);
    date = new Date(date);
    date.setDate(date.getDate() + 1);
  }
  
  const l = employees.length;
  for (let i = 0; i < l; i++) {
    const employee = employees[i];
    for (let j = 1; j < days.length - 1; j++) { 
      let cumDuration = 0;
      let started = false;
      const day = days[j];

      const h = Math.floor((6 + (i / l) * 10) * 2) / 2
      const punches = []
      let punch, projectedStart, projectedEnd;
  
      punch = new Date(day);
      punch.setHours(0, 0, 0, 0);
      punch = new Date(+punch + +employee.shift.start - +new Date(2000, 0, 1));
      projectedStart = new Date(punch);
  
      if (punch < now) {
        started = true;
        punches.push(punch);
      }
  
      punch = new Date(punch);
      punch.setHours(punch.getHours() + 4);
  
      if (punch < now) punches.push(punch);
  
      punch = new Date(punch);
      punch.setHours(punch.getHours(), punch.getMinutes() + 30);
  
      if (punch < now) punches.push(punch);
  
      punch = new Date(punch);
      punch.setHours(punch.getHours() + 4);
      projectedEnd = new Date(punch);
  
      if (punch < now) punches.push(punch);
  
      const components: ShiftComponent[] = [];
      const employeeId = employee.id;
      for (let i = 0; i < 2; i++) {
        const start = punches[i * 2];
        if (start == null) {
          break;
        }
        let end = punches[i * 2 + 1];
        let state: ShiftState;
  
        if (end == null) {
          end = now;
          state = ShiftState.Incomplete;
        } else {
          state = ShiftState.Complete;
        }
        const duration = end - start;
        cumDuration += duration;
  
        components.push({
          showTime: true,
          type: ShiftComponentType.Actual,
          state,
          start,
          end,
          duration,
          employeeId,
          x: 0,
          w: 0,
          fill: d3.color(''),
        });
      }
  
      if (punches.length != 4) {
        components.unshift({
          showTime: components.length == 0,
          type: ShiftComponentType.Projected,
          start: new Date(punches.length == 3 ? punches[2] : punches.length == 1 ? punches[0] : projectedStart),
          end: projectedEnd,
          duration: projectedEnd - projectedStart,
          employeeId,
          x: 0,
          w: 0,
          fill: d3.color(''),
        });
      }
  
      shifts.push({
        x: 0,
        y: 0,
        id: `${i}`,
        employee,
        components,
        started,
        punches: punches.map(date => ({date})),
        start: new Date(punches.length > 0 ? punches[0] : projectedStart),
        end: new Date(punches.length > 0 && punches.length % 2 == 0 ? punches[punches.length - 2] : projectedEnd),
        duration: cumDuration,
        expectedDuration: employee.shift.duration,
      });
    }
  }
}

const arc = d3.arc().outerRadius(10);
function drawMiniPie(sel, frac: number, fillA, fillB, radius = 10) {
  frac = Math.min(Math.max(frac, 0), 1);
  return sel.append('g')
    .attr('transform', `translate(${radius},${radius/2})`)
    .call(s => s.append('circle').attr('r', 10).attr('fill', fillB))
    .call(s => s.append('path')
      .attr('fill', fillA)
      .attr('d', d => arc({
        startAngle: 0,
        endAngle: 2 * Math.PI * frac,
        outerRadius: radius,
        innerRadius: 0,
      }))
    );
}

function byEmployee(employeeId, centerDate: Date) {
  const filteredShifts = [];
  for (const shift of shifts) {
    if (shift.employee.id == employeeId) {
      filteredShifts.push(shift);
    }
  }
}

function getData(now, [minDate, maxDate]): DataSet {
  console.log(minDate, maxDate);
  const employeeIds = [];
  const filteredShifts = [];
  for (const shift of shifts) {
    if ((shift.start > minDate && shift.start < maxDate) ||
      (shift.end > minDate && shift.end < maxDate) ||
      (shift.start < minDate && shift.end > maxDate)) {
      filteredShifts.push(shift);
      if (!employeeIds.includes(shift.employee.id)) employeeIds.push(shift.employee.id);
    }
  }
  return {shifts: filteredShifts, employeeIds};
}

setupData(now);

{
  const [minDate, maxDate] = xScale.domain();
  main(getData(now, [minDate, maxDate]));
}

// lazy, not right yet
//window.onresize = () => {
//  size();
//  drawAxis();
//}

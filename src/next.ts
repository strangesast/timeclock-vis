import * as d3 from 'd3';
import { formatTime } from './util';
const LOCALE = 'en';

const svg : d3.Selection<SVGElement, {}, HTMLElement, any> = d3.select('svg');

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
  start: Date;
  components: ShiftComponent[];
  punches: {
    date: Date
  }[],
  y: number;
  x: number;
}

interface DataSet {
  shifts: Shift[];
  employeeIds: string[];
}

const today = new Date();
today.setHours(0, 0, 0, 0);

let width, height;
let xScale = d3.scaleTime();
let topAxis = d3.axisTop(xScale);
let bottomAxis = d3.axisBottom(xScale);
const yScale = d3.scaleBand().padding(0.3).align(1);

const colorScale = d3.scaleOrdinal(d3.schemePaired);


const zoom = d3.zoom().on('zoom', zoomed);

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
size();

const xScaleCopy = xScale.copy();

svg.call(zoom);

function size() {
  ({ width, height } = svg.node().getBoundingClientRect());
  xScale.range([0, width]);
  yScale.range([40, height - 40]);
  svg.node().style.setProperty('--shift-label-size', `${(yScale.step() - yScale.bandwidth()) / 10 * 2 / 3}px`);
}

function updatePositions(shift: Shift) {
  let x = 0;
  for (let i = shift.components.length - 1; i >= 0; i--) {
    const comp = shift.components[i];
    let fill = d3.color(colorScale(shift.employee.id));
    if (comp.type == ShiftComponentType.Projected) {
      fill = fill.brighter(0.9);
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
        x = Math.min(x + spacing - padding, Math.max(width / 2, x + padding));
      }

      return `translate(${x},${30})`;
    })
}

function main({employeeIds, shifts}: DataSet) {
  drawAxis();

  const bandwidth = yScale.bandwidth();

  g.selectAll<SVGElement, Shift>('g.shift').data(shifts, d => d.id)
    .join(
      enter => enter.append('g').classed('shift', true)
        .call(s => s.append('g').classed('text', true)
          .call(s => s.append('text')
            .classed('shift-label', true)
            .attr('y', 6)
            .attr('text-anchor', 'start')
            .attr('alignment-baseline', 'hanging')
            .text(d => d.employee.name)
          )
        )
        .call(s => s.selectAll('g.group').data(d => d.components).enter().append('g').classed('group', true)
          .call(e => e.append('rect').attr('height', bandwidth).attr('rx', 8))
          .call(e => e.append('text').attr('alignment-baseline', 'middle').attr('y', bandwidth / 2))
        ),
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
        .filter(d => d.type == ShiftComponentType.Projected)
        .attr('opacity', 0.5)
      )
      .call(s => s.select('text').attr('x', 4).text(d => formatTime(d.start)))

    );
  console.log(`width: ${width}`);
}


function redraw() {
  g.selectAll<SVGElement, Shift>('g.shift')
}

const employees = Array.from(Array(10)).map((_, i) => ({
  id: `${i}`,
  name: `Employee ${i + 1}`,
}));

const employeeIds = employees.map(empl => empl.id);

yScale.domain(employeeIds);
colorScale.domain(employeeIds);


const now = new Date(today);
now.setHours(14, 22);

const shifts: Shift[] = employees.map((employee, i) => {
  const h = Math.floor((6 + (i / employees.length) * 10) * 2) / 2
  const punches = []
  let punch, projectedStart, projectedEnd;

  punch = new Date(today);
  punch.setHours(h);
  projectedStart = new Date(punch);

  if (punch < now) punches.push(punch);

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
      state = ShiftState.Complete;
    } else {
      state = ShiftState.Complete;
    }
    const duration = end - start;

    components.push({type: ShiftComponentType.Actual, state, start, end, duration, employeeId, x: 0, w: 0, fill: d3.color('')});
  }

  if (punches.length != 4) {
    components.unshift({
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

  return updatePositions({
    x: 0,
    y: 0,
    id: `${i}`,
    employee,
    components,
    punches: punches.map(date => ({date})),
    start: new Date(punches.length > 0 ? punches[0] : projectedStart),
  });
});


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
      .call(s => s.select('rect')
        .attr('width', d => d.w)
        .attr('fill', d => d.fill.toString())
      )
      .call(s => s.select('text').attr('x', 4).text(d => formatTime(d.start)))
    );
}

function formatDate(date: Date) {
  const a = date.toLocaleDateString(LOCALE, { weekday: 'long' });
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${a} ${m}/${d}`;
}

main({shifts, employeeIds});

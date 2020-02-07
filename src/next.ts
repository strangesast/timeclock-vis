import * as d3 from 'd3';
import { formatTime } from './util';
const LOCALE = 'en';

const svg : d3.Selection<SVGElement, {}, HTMLElement, any> = d3.select('svg');

enum ShiftState {
  Complete = 'complete',
  Incomplete = 'incomplete',
}

interface ShiftComponent {
  x: number;
  w: number;
  fill: string;
  start: Date;
  end: Date;
  duration: number;
  state: ShiftState;
  employeeId: string; // needed for fill (gay)
}

interface Shift {
  id: string;
  employee: {
    id: string;
    name: string;
  }
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
}

function updatePositions(shift: Shift) {
  const fill = colorScale(shift.employee.id);
  let x = 0;
  for (let i = shift.components.length - 1; i >= 0; i--) {
    const comp = shift.components[i];
    x = xScale(comp.start);
    comp.fill = fill;
    comp.x = x;
    comp.w = xScale(comp.end) - comp.x;
  }
  shift.y = yScale(shift.employee.id);
  shift.x = Math.max(x, 0);
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
    x: number;
  }
  const labels: DateLabel[] = [];
  const [minDate, maxDate] = xScale.domain();
  let date = new Date(minDate);
  date.setHours(12, 0, 0, 0);
  for (; date < maxDate; date.setDate(date.getDate() + 1)) {
    labels.push({id: date.toISOString().slice(0, 10), date: new Date(date), x: xScale(date)});
  }
  svg.select('g.axis.date').selectAll<SVGElement, DateLabel>('g').data(labels, d => d.id)
    .join(
      enter => enter.append('g').call(s => s.append('text').text(d => formatDate(d.date))),
      update => update,
      exit => exit.remove(),
    )
    .attr('transform', (d, i) => `translate(${d.x},${30})`)
}

function main({employeeIds, shifts}: DataSet) {
  drawAxis();

  const bandwidth = yScale.bandwidth();

  g.selectAll<SVGElement, Shift>('g.shift').data(shifts, d => d.id)
    .join(
      enter => enter.append('g').classed('shift', true)
        .call(s => s.append('g').classed('text', true)
          .call(s => s.append('text')
            .attr('y', 4)
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
        .attr('fill', d => d.fill)
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


const shifts: Shift[] = employees.map((employee, i) => {
  const h = Math.floor((6 + (i / employees.length) * 10) * 2) / 2
  const punches = Array.from(Array(4));
  punches[0] = new Date(today);
  punches[0].setHours(h);

  punches[1] = new Date(punches[0]);
  punches[1].setHours(punches[1].getHours() + 4);

  punches[2] = new Date(punches[1]);
  punches[2].setHours(punches[2].getHours(), punches[2].getMinutes() + 30);

  punches[3] = new Date(punches[2]);
  punches[3].setHours(punches[3].getHours() + 4);

  const components: ShiftComponent[] = Array.from(Array(2));
  for (let i = 0; i < 2; i++) {
    const start = punches[i * 2];
    const end = punches[i * 2 + 1];
    const duration = end - start;
    const employeeId = employee.id;
    const state = ShiftState.Complete;
    components[i] = {state, start, end, duration, employeeId, x: 0, w: 0, fill: ''};
  }
  return updatePositions({
    x: 0,
    y: 0,
    id: `${i}`,
    employee,
    components,
    punches: punches.map(date => ({date})),
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
        .attr('fill', d => d.fill)
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

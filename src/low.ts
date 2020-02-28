import { svg, html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat';
import { Subject } from 'rxjs';
import { switchMap, map, throttleTime } from 'rxjs/operators';
import * as Comlink from 'comlink';
import * as d3 from 'd3';

import { Employee, ShiftComponent, Shift, ShiftComponentType } from './models';
import { employeeColorScale, formatTime } from './util';

const redraw = new Subject();

const [width, height] = [window.innerWidth, window.innerHeight];
const worker = Comlink.wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;

const now = d3.timeWeek.floor(new Date());
now.setDate(now.getDate() + 3);
now.setHours(14, 22, 0, 0);
 
const targetWidth = 30 / 3600000; // 30 pixels per hour

const targetDomainWidth = 2 * 7 * 24 * 60 * 60 * 1000; // two weeks
const totalWidth = targetDomainWidth * targetWidth;

const domainWidth = width / targetWidth;
const d0 = new Date(+now - domainWidth / 2);
const d1 = new Date(+now + domainWidth / 2);

const initialDomain = [d0, d1];

const margin = {top: 40, left: 10, right: 10, bottom: 10};

const yScale = d3.scaleOrdinal<string, number>();

const x0 = totalWidth / 2 - width / 2;
const x1 = x0 + width;
const xScale = d3.scaleTime().range([x0, x1]).domain(initialDomain);

// const inView = [xScale.invert(width), xScale.invert(width + width)];

const rowStep = 70;
const rowTextHeight = 16;
const rectHeight = 40;


redraw.pipe(
  throttleTime(100),
  map(([x0, w]) => [xScale.invert(x0), xScale.invert(x0 + w)]),
  switchMap(domain => worker.getShiftsInRange(domain)),
).subscribe((data: any) => {
  data.shifts.forEach(updatePositions);
  render(template(data, dim), document.body);
});

async function main() {
  await worker.initializeData(now);
  const data = await worker.getShiftsInRange(initialDomain);
  const yRange = data.employeeIds.map((_, i) => margin.top + i * rowStep);
  dim[1] = yRange[yRange.length - 1] + rowStep;
  yScale.domain(data.employeeIds).range(yRange);
  data.shifts.forEach(updatePositions);
  render(template(data, dim), document.body);
}

const filterShiftComponentTimeVisibility = (d: ShiftComponent) => svg`
  <text class="time start" opacity=${d.showTime && d.w > 120 ? 1 : 0} y=${rectHeight/2} x=4>${formatTime(d.start)}</text>
  <text class="time end" opacity=${d.showTime && d.w > 200 ? 1 : 0} y=${rectHeight/2} x=${d.w - 4}>${formatTime(d.end)}</text>
`;

function updatePositions(shift: Shift) {
  for (const comp of shift.components) {
    const index = comp.type == ShiftComponentType.Projected ? 1 : 0;
    comp.fill = d3.color(employeeColorScale(shift.employee)[index]);
    comp.x = xScale(comp.start);
    comp.w = Math.max(xScale(comp.end) - comp.x, 0);
  }
  shift.y = yScale(shift.employee);
  const [a, b] = [shift.start, shift.end || now].map(xScale);
  shift.x = Math.min(Math.max(a, 0), b);
  return shift;
}


const arc = d3.arc();
function drawMiniPie(frac: number, employeeId: string, radius = 10) {
  const c = employeeColorScale(employeeId);
  const endAngle = 2 * Math.PI * Math.min(Math.max(frac, 0), 1);
  const startAngle = 0;
  return svg`
  <g transform=${formatTransform([radius, radius/2])}>
    <circle r="10" fill=${c[1]}></circle>
    <path d=${arc({ startAngle, endAngle, outerRadius: radius, innerRadius: 0 })} fill=${c[0]}>
  </g>
  `;
}

const formatName = (empl: Employee) => `${empl.Name} ${empl.LastName}`;
const formatTransform = ([x, y]: [number, number]) => {
  if (isNaN(y)) {
    throw new Error('wahtt');
  }
  return `translate(${x},${y})`;
}
const resetHandler = {
  handleEvent(e) {
    window.scrollTo({...args, behavior: 'smooth'});
  },
  capture: true,
};
const template = ({shifts, employees}: {shifts: Shift[], employees: {[id: string]: Employee}}, dim: number[]) => html`
<header>
  <button @click=${resetHandler}>Reset</button>
</header>
<svg width=${dim[0]} height=${dim[1]}>
${repeat(shifts, shift => shift.id, (shift, index) => svg`
  <g transform=${formatTransform([0, shift.y])}>
    <g class="text" transform=${formatTransform([shift.x, -rowTextHeight])}>
      ${shift.started ? drawMiniPie(shift.duration / shift.expectedDuration, shift.employee) : ''}
      <text class="name" x=${shift.started ? 24 : 0} y=${5}>${formatName(employees[shift.employee])}</text>
    </g>
    ${repeat(shift.components, c => c.id, (component, index) => svg`
      <g transform=${formatTransform([component.x, 0])}>
        <rect rx=8 ry=8 width=${component.w} height=${rectHeight} fill=${component.fill.toString()}></rect>
        ${filterShiftComponentTimeVisibility(component)}
      </g>
    `)}
  </g>
`)}
</svg>
`

const data = {
  shifts: [],
  employeeIds: [],
  employees: {},
};

const dim = [totalWidth, height];

render(template(data, dim), document.body);
const smooth = false;
let args = {left: width, top: 0, behavior: (smooth ? 'smooth' : 'auto') as ScrollBehavior};
document.addEventListener('DOMContentLoaded', async () => {
  args.left = xScale(initialDomain[0]);
  await main();
  window.scrollTo(args);
  window.addEventListener('scroll', () => {
    redraw.next([window.scrollX, window.innerWidth]);
  });
});
window.addEventListener('beforeunload', () => window.scrollTo(args));

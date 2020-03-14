import { svg, html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat';
import { Subject } from 'rxjs';
import { switchMap, map, throttleTime } from 'rxjs/operators';
import * as Comlink from 'comlink';
import * as d3 from 'd3';

import { Employee, ShiftComponent, Shift, ShiftComponentType, EmployeeShiftColor } from './models';
import { employeeColorScale, formatDuration, formatTime, formatDateWeekday } from './util';

declare const GENERATE_MOCKING: boolean;
const worker = Comlink.wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;


let now: Date;

const margin = {top: 40, left: 10, right: 10, bottom: 10};

// const inView = [xScale.invert(width), xScale.invert(width + width)];

const rowStep = 70;
const rowTextHeight = 16;
const rectHeight = 40;


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
  const {innerWidth: width, innerHeight: height} = window;

  const resolution = 30 / 3600000; // 30 pixels per hour
  const domainWidth = width / resolution;
  const targetDomainWidth = 20 * 7 * 24 * 60 * 60 * 1000; // two weeks
  const totalWidth = targetDomainWidth * resolution;

  const rowCount = 15;
  const contentHeight = rowCount * rowStep + margin.top;

  const d0 = new Date(+date - domainWidth / 2);
  const d1 = new Date(+date + domainWidth / 2);
  const initialDomain = [d0, d1];

  const x0 = totalWidth / 2 - width / 2;
  const x1 = x0 + width;
  const xScale = d3.scaleTime().range([x0, x1]).domain(initialDomain);

  const redraw = new Subject();
  redraw.pipe(
    throttleTime(100),
    map(([x0, w]) => [xScale.invert(x0), xScale.invert(x0 + w)]),
    switchMap(domain => worker.getShiftsInRange(domain)),
  ).subscribe((data: any) => {
    const dim = [totalWidth, contentHeight];
    data.shifts.forEach(updatePositions);
    render(template(data, dim), document.body);
  });

  const updatePositions = (shift: Shift, employees: {[id: string]: Employee}) => {
    for (const comp of shift.components) {
      const index = comp.type == ShiftComponentType.Projected ? 1 : 0;
      comp.fill = d3.color(employeeColorScale(employees[shift.employee].Color.toString())[index]);
      comp.x = xScale(comp.start);
      comp.w = Math.max(xScale(comp.end) - comp.x, 0);
    }
    // shift.y = yScale(shift.employee);
    shift.y = shift.row * rowStep + margin.top;
    const [a, b] = [shift.start, shift.end || now].map(xScale);
    shift.x = Math.min(Math.max(a, 0), b);
    if (isNaN(shift.y)) {
      console.log(shift);
    }
    return shift;
  }

  const resetClickHandler = {
    handleEvent(e) {
      window.scrollTo({...args, left: xScale(now) - width / 2, behavior: 'smooth'});
    },
    capture: true,
  };
  const shiftClickHandlerFn = (shift: Shift) => ({
    handleEvent(e) {
      cleanup();
      byEmployee(shift.employee, shift.start);
    },
    capture: true,
  })
  const template = ({shifts, employees}: {shifts: Shift[], employees: {[id: string]: Employee}}, [w, h]: number[]) => html`
  <header>
    <button @click=${resetClickHandler}>Reset</button>
  </header>
  <header>
    
  </header>
  <svg width=${w} height=${h}>
  ${repeat(shifts, shift => shift.id, (shift, index) => svg`
    <g @click=${shiftClickHandlerFn(shift)} class="shift" transform=${formatTransform([0, shift.y])}>
      <g class="text" transform=${formatTransform([shift.x, -rowTextHeight])}>
        ${shift.started ? drawPieAndTime(shift, employees[shift.employee].Color) : ''}
        <text class="name" x=${shift.started ? 80 : 0} y=${5}>${formatName(employees[shift.employee])}</text>
      </g>
      ${repeat(shift.components, c => c.id, (component, index) => svg`
        <g transform=${formatTransform([component.x, 0])}>
          <rect rx=8 ry=8 width=${component.w} height=${rectHeight} fill=${component.fill.toString()}></rect>
          ${filterShiftComponentTimeVisibility(component)}
          <title>${formatTime(component.start)}-${formatTime(component.end)}</title>
        </g>
      `)}
    </g>
  `)}
  </svg>
  `
  const onScroll = () => redraw.next([window.scrollX, window.innerWidth]);
  const onBeforeUnload = () => window.scrollTo(args);

  window.addEventListener('scroll', onScroll);
  window.addEventListener('beforeunload', onBeforeUnload);

  let args = {left: xScale(initialDomain[0]), top: 0, behavior: 'auto' as ScrollBehavior};
  const dim = [totalWidth, height];
  render(template({shifts: [], employees: {}}, dim), document.body);
  window.scrollTo(args);


  const cleanup = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}

function byEmployee(employeeId: string, date = new Date()) {
  const {innerWidth: width, innerHeight: height} = window;

  const domainHeight = height / rowStep * 8.64e7;
  const d0 = new Date(+date - domainHeight / 2);
  const d1 = new Date(+date + domainHeight / 2);

  domainHeight / height

  const totalHeight = rowStep * 20 * 7;

  // const resolution = 30 / 3600000; // 30 pixels per hour
  // const domainWidth = width / resolution;
  // const targetDomainWidth = 2 * 7 * 24 * 60 * 60 * 1000; // two weeks
  // const totalWidth = targetDomainWidth * resolution;

  // const rowCount = 8;
  // const contentHeight = rowCount * rowStep + margin.top;

  // const d0 = new Date(+now - domainWidth / 2);
  // const d1 = new Date(+now + domainWidth / 2);
  // const initialDomain = [d0, d1];

  // let minDate = d3.timeWeek.floor(date);
  // let maxDate = d3.timeDay.offset(minDate, 7);

  const yScale = d3.scaleTime().domain([d0, d1]).range([totalHeight / 2 - height / 2, totalHeight / 2 + height / 2]);
  const xScale = d3.scaleTime().range([margin.left, width - margin.right]);

  const redraw = new Subject();
  redraw.pipe(
    throttleTime(100),
    map(([y0, h]) => [yScale.invert(y0), yScale.invert(y0 + h)]),
    switchMap(domain => worker.getShiftsByEmployeeInRange(employeeId, domain)),
  ).subscribe((data: any) => {
    // uggggly
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
    render(template(data, dim), document.body);
  });


  const [minx, maxx] = xScale.range();
  const extent: [[number, number], [number,number]] = [
    [minx, -Infinity],
    [maxx, Infinity]
  ];
  const updatePositions = (shift: Shift, employees: {[id: string]: Employee}) => {
    calculateNorms(shift);
    for (const comp of shift.components) {
      const index = comp.type == ShiftComponentType.Projected ? 1 : 0;
      comp.fill = d3.color(employeeColorScale(employees[shift.employee].Color.toString())[index]);
      comp.x = xScale(comp.startNorm);
      comp.w = Math.max(xScale(comp.endNorm) - comp.x, 0);
    }
    shift.y = yScale(d3.timeDay.floor(shift.start));
    shift.x = Math.max(xScale(shift.startNorm), 0);
    return shift;
  }

  const resetClickHandler = {
    handleEvent(e) {
      window.scrollTo({...args, top: yScale(d3.timeWeek.floor(now)), behavior: 'smooth'});
    },
    capture: true,
  };
  const shiftClickHandlerFn = (shift: Shift) => ({
    handleEvent(e) {
      cleanup();
      byTime(shift.start);
    },
    capture: true,
  });

  const template = ({shifts, employees}: {shifts: Shift[], employees: {[id: string]: Employee}}, [w, h]: number[]) => html`
  <header>
    <button @click=${resetClickHandler}>Reset</button>
  </header>
  <header>
    
  </header>
  <svg width=${w} height=${h}>
  ${repeat(shifts, shift => shift.id, (shift, index) => svg`
    <g @click=${shiftClickHandlerFn(shift)} class="shift" transform=${formatTransform([0, shift.y])}>
      <g class="text" transform=${formatTransform([shift.x, -rowTextHeight])}>
        ${shift.started ? drawPieAndTime(shift, employees[shift.employee].Color) : ''}
        <text class="name" x=${shift.started ? 80 : 0} y=${5}>${formatDateWeekday(shift.start)}</text>
      </g>
      ${repeat(shift.components, c => c.id, (component, index) => svg`
        <g transform=${formatTransform([component.x, 0])}>
          <rect rx=8 ry=8 width=${component.w} height=${rectHeight} fill=${component.fill.toString()}></rect>
          ${filterShiftComponentTimeVisibility(component)}
          <title>${formatTime(component.start)}-${formatTime(component.end)}</title>
        </g>
      `)}
    </g>
  `)}
  </svg>
  `
  const onScroll = () => redraw.next([window.scrollY, window.innerHeight]);
  const onBeforeUnload = () => window.scrollTo(args);

  window.addEventListener('scroll', onScroll);
  window.addEventListener('beforeunload', onBeforeUnload);

  let args = {left: 0, top: yScale(d3.timeWeek.floor(date)), behavior: 'auto' as ScrollBehavior};
  const dim = [width, totalHeight];
  render(template({shifts: [], employees: {}}, dim), document.body);
  window.scrollTo(args);


  const cleanup = () => {
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



const drawPieAndTime = (shift: Shift, employeeColor: EmployeeShiftColor) => svg`
  ${drawMiniPie(shift.duration / shift.expectedDuration, employeeColor)}
  <text class="time" y="5" x="24" >${formatDuration(shift.duration)}</text>
`;

const START_MIN_WIDTH_THRESHOLD = 50;
const END_MIN_WIDTH_THRESHOLD = 100;
const filterShiftComponentTimeVisibility = (d: ShiftComponent) => svg`
  <text class="time start" opacity=${d.w > START_MIN_WIDTH_THRESHOLD ? 1 : 0} y=${rectHeight/2} x=4>${formatTime(d.start)}</text>
  <text class="time end" opacity=${d.w > END_MIN_WIDTH_THRESHOLD ? 1 : 0} y=${rectHeight/2} x=${d.w - 4}>${formatTime(d.end)}</text>
`;

const arc = d3.arc();
function drawMiniPie(frac: number, employeeColor: EmployeeShiftColor, radius = 10) {
  const c = employeeColorScale(employeeColor.toString());
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
const data = {
  shifts: [],
  employeeIds: [],
  employees: {},
};


const smooth = false;
document.addEventListener('DOMContentLoaded', async () => {
  await main();
});

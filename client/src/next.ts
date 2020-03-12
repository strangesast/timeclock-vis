import * as d3 from 'd3';
import { Observable, BehaviorSubject, timer } from 'rxjs';
import { switchMap, filter, map, scan, startWith, audit, auditTime, throttleTime } from 'rxjs/operators';
import { formatName, formatDuration, formatDateWeekday, formatTime, inFieldOfView, throttle, employeeColorScale, debounce } from './util';
import { ShiftState, Shift, Employee, EmployeeShiftColor, ShiftComponent, ShiftComponentType, EmployeeID, TranslateExtent } from './models';
import * as Comlink from 'comlink';

declare const GENERATE_MOCKING: boolean;
const defaultExtent: [[number, number], [number, number]] = [[-Infinity,-Infinity], [Infinity, Infinity]];

let width,
  height,
  yScale,
  xScale,
  topAxis,
  zoom,
  bottomAxis,
  xScaleCopy,
  yScaleCopy;

const bandwidth = 30;
const rowTextHeight = 20;
const step = 64;
const worker = Comlink.wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;
const svg: d3.Selection<SVGElement, {}, HTMLElement, any> = d3.select('svg');
const margin = {left: 10, right: 10, top: 80, bottom: 40};
// svg.append('rect').classed('background', true).attr('height', '100%').attr('width', '100%');
// svg.append('rect').classed('active', true).attr('height', '100%');
// svg.append('g').classed('shifts', true).attr('transform', `translate(0,${margin.top})`);
svg.select('g.shifts').attr('transform', `translate(0,${margin.top})`);


updateSize();

drawButton('Dark Mode', [120, 36])
  .attr('transform', `translate(${width - 264},${4})`)
  .on('click', () => svg.classed('dark', !svg.classed('dark')));

drawButton('Reset', [120, 36])
  .attr('transform', `translate(${width - 134},${4})`)
  .on('click', () => svg.transition().duration(1000).call(zoom.transform, d3.zoomIdentity));

(async function() {

  let now;
  if (GENERATE_MOCKING) {
    now = d3.timeWeek.floor(new Date());
    now.setDate(now.getDate() + 3);
    now.setHours(14, 22, 0, 0);
  
    await worker.initializeData(now);
  } else {
    now = new Date();
  }
  
  const today = d3.timeDay.floor(new Date(now));
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(today);
  start.setHours(4);

  const [minDate, maxDate] = [start, tomorrow];

  byTime([minDate, maxDate]);
})();

function updateSize() {
  ({ width, height } = svg.node().getBoundingClientRect());
}

function byTime([minDate, maxDate], now = new Date()) {
  // setup
  svg.call(zoom = d3.zoom()
    .translateExtent(defaultExtent)
    .scaleExtent([.4, 100])
    .on('start', zoomStarted)
    .on('end', zoomEnded)
    .on('zoom', zoomed)
  );
  xScale = d3.scaleTime().domain([minDate, maxDate]).range([margin.left, width - margin.right]);
  xScaleCopy = xScale.copy();

  // yScale = d3.scaleOrdinal<number>();
  // yScaleCopy = yScale.copy();

  topAxis = d3.axisTop(xScale);
  bottomAxis = d3.axisBottom(xScale);

  let s;
  if ((s = svg.select('g.axis').select('g.axis.top')).empty()) {
    s = svg.select('g.axis').append('g').classed('axis top', true);
  }
  s.call(topAxis);

  if ((s = svg.select('g.axis').select('g.axis.bottom')).empty()) {
    s = svg.select('g.axis').append('g').classed('axis bottom', true);
  }
  s.call(bottomAxis);
 
  let dateAxis;
  if (dateAxis = svg.select('g.axis').select('g.axis.date')) {
    dateAxis = svg.select('g.axis').append('g').classed('axis date', true);
  }

  let lastDomain = [minDate, maxDate];
  const updated = new BehaviorSubject(lastDomain);

  const o = updated.pipe(
    map(arg => [arg]), // should not refresh when minDate > lastMinDate && maxDate < lastMaxDate
  );
  const sub = fancy(o, [[minDate, maxDate]], worker.getShiftsInRange.bind(worker))
    .subscribe(result => {
      const [{shifts, employeeIds, employees}, args] = result as any;
      ([lastDomain] = args);
      draw(shifts, employeeIds, employees)
    });

  drawAxis();

  let i = 0; // ugly hack for i > 0 redraws (due to zooming)
  let lastOffsetY = 0,
    currentOffset = 0,
    dy = 0,
    transform = d3.zoomIdentity;


  function draw(shifts: Shift[], employeeIds: EmployeeID[], employees: {[id: string]: Employee}) {
    // yScale.domain(employeeIds).range(Array.from(Array(employeeIds.length)).map((_, i) => i * step));

    shifts.forEach(updatePositions);

    const t = d3.transition().duration(500);

    const [a, b] = lastDomain.map(d => xScale(d));
    svg.select('#clip').select('rect.fg').attr('transform', `translate(${a},0)`).attr('width', b - a).attr('height', '100%');

    if (i == 0) {
      i = 1;
      svg.select('g.shifts').selectAll<SVGElement, Shift>('g.shift').data(shifts, d => d._id)
        .join(
          enter => enter.append('g')
            .call(drawShift, bandwidth, employees)
            .call(s => s.select('g.text').attr('transform', d => `translate(${d.x+4},${-rowTextHeight})`))
            .call(s => s.selectAll<SVGElement, ShiftComponent>('g.group')
              .attr('transform', d => `translate(${d.x},0)`)
              .call(s => s.select('rect')
                .attr('width', d => d.w)
                .attr('fill', d => d.fill.toString())
                .attr('stroke', d => d.fill.toString())
              )
              .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
              .each(filterShiftComponentTimeVisibility),
            )
            .each(function (d) {
              d3.select(this)
                .attr('opacity', 0)
                .attr('transform', `translate(0,${d.y + 40+currentOffset})`)
                .transition(t)
                .delay(200)
                .attr('opacity', 1)
                .attr('transform', `translate(0,${d.y+currentOffset})`)
            }),
          update => update
            .call(s => s.selectAll('g.group').data(d => d.components))
            .call(s => s.transition(t).delay(100)
              .call(s => s.select('g.text').each(function (d) {
                const employee = employees[d.employee] as Employee;
                const s = d3.select(this);
                const text = s.select<SVGGraphicsElement>('text')
                  .text((d: Shift) => formatName(employee));
                const dx = text.node().getBBox().width + 4;
                s.select('g.duration').attr('transform', `translate(${dx},0)`);
              }))
              .call(s => s.select('g.text').attr('transform', (d: any) => `translate(${d.x+4},${-rowTextHeight})`))
              .attr('transform', d => `translate(0,${d.y+currentOffset})`)
              .selectAll<SVGElement, ShiftComponent>('g.group')
                .attr('transform', d => `translate(${d.x},0)`)
                .call(s => s.select('rect')
                  .attr('width', d => d.w)
                  .attr('fill', d => d.fill.toString())
                  .attr('stroke', d => d.fill.toString())
                )
                .call(s => s.select('text.time.start').attr('x', 4))
                .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
                .each(filterShiftComponentTimeVisibility)
            ),
          exit => exit.attr('opacity', 1).transition(t).attr('opacity', 0).remove(),
        )
        .on('click', function(d) {
          d3.select(this).on('click', null); // probs should be in byEmployee
          cleanup();
          byEmployee(employees[d.employee], d.start);
        });
    } else {
      svg.select('g.shifts').selectAll<SVGElement, Shift>('g.shift').data(shifts, d => d._id)
        .join(
          enter => enter.append('g')
            .call(drawShift, bandwidth, employees)
            .attr('transform', d => `translate(0,${d.y+currentOffset})`)
            .call(s => s.select('g.text').attr('transform', d => `translate(${d.x+4},${-rowTextHeight})`))
            .call(s => s.selectAll<SVGElement, ShiftComponent>('g.group')
              .attr('transform', d => `translate(${d.x},0)`)
              .call(s => s.select('rect')
                .attr('width', d => d.w)
                .attr('fill', d => d.fill.toString())
                .attr('stroke', d => d.fill.toString())
              )
              .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
              .each(filterShiftComponentTimeVisibility),
            )
            .call(s => s.attr('opacity', 0).transition(t).delay(200).attr('opacity', 1)),
          update => update
            .call(s => s.selectAll('g.group').data(d => d.components))
            .call(s => s
              .call(s => s.select('g.text').each(function (d) {
                const s = d3.select(this);
                const text = s.select<SVGGraphicsElement>('text').text((d: any) => formatName(employees[d.employee]));
                const dx = text.node().getBBox().width + 4;
                s.select('g.duration').attr('transform', `translate(${dx},0)`);
              }))
              .call(s => s.select('g.text').attr('transform', (d: any) => `translate(${d.x+4},${-rowTextHeight})`))
              .attr('transform', d => `translate(0,${d.y+currentOffset})`)
              .selectAll<SVGElement, ShiftComponent>('g.group')
                .attr('transform', d => `translate(${d.x},0)`)
                .call(s => s.select('rect')
                  .attr('width', d => d.w)
                  .attr('fill', d => d.fill.toString())
                  .attr('stroke', d => d.fill.toString())
                )
              .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
                .each(filterShiftComponentTimeVisibility)
            ),
          exit => exit.attr('opacity', 1).transition(t).attr('opacity', 0).remove(),
        )
        .on('click', function(d) {
          d3.select(this).on('click', null); // probs should be in byEmployee
          cleanup();
          byEmployee(employees[d.employee], d.start);
        });
    }
  };

  function updatePositions(shift: Shift) {
    for (const comp of shift.components) {
      const index = comp.type == ShiftComponentType.Projected ? 1 : 0;
      comp.fill = d3.color(employeeColorScale(shift.employeeColor.toString())[index]);
      comp.x = xScale(comp.start);
      comp.w = Math.max(xScale(comp.end) - comp.x, 0);
    }
    shift.y = shift.row * step + rowTextHeight; //  yScale(shift.employee);
    const [a, b] = [shift.start, shift.end || now].map(xScale);
    shift.x = Math.min(Math.max(a, 0), b);
    return shift;
  }

  function zoomStarted() {
    const { sourceEvent } = d3.event;
    if (sourceEvent == null) return;
    lastOffsetY = sourceEvent.type == "touchstart" ? sourceEvent.touches[0].screenY : sourceEvent.offsetY;
  }

  function zoomEnded() {
    currentOffset = dy;
  }

  function zoomed() {
    xScale = d3.event.transform.rescaleX(xScaleCopy);

    // manually compute the drag distance and create zoom transform
    const { sourceEvent } = d3.event;
    if (sourceEvent != null) {
      const {type, touches, offsetY } = sourceEvent; 
      dy = (type == 'touchmove' ? touches[0].screenY : offsetY) - lastOffsetY + currentOffset;
    }

    topAxis = topAxis.scale(xScale);
    bottomAxis = bottomAxis.scale(xScale);
    drawAxis();

    const [a, b] = lastDomain.map(d => xScale(d));
    svg.select('#clip').select('rect.fg').attr('transform', `translate(${a},0)`).attr('width', b - a).attr('height', '100%');
    
    svg.select('g.shifts').selectAll<SVGElement, Shift>('g.shift')
      .each(updatePositions)
      .attr('transform', shift => `translate(0,${shift.y + dy})`)
      .call(s => s.select('g.text').attr('transform', d => `translate(${d.x + 4},${-rowTextHeight})`))
      .call(s => s.selectAll<SVGElement, ShiftComponent>('g.group')
        .attr('transform', d => `translate(${d.x},0)`)
        .call(s => s.select('rect').attr('width', d => d.w))
        .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
        .each(filterShiftComponentTimeVisibility)
      );
    updated.next(xScale.domain());
  }

  function resized() {
    updateSize(); // update width / height vars
    xScale = xScale.range([margin.left, width - margin.right]);
    xScaleCopy = xScale.copy();
    topAxis.scale(xScale);
    bottomAxis.scale(xScale);
    drawAxis();

    const t = d3.transition().duration(200);

    svg.select('g.shifts').selectAll<SVGElement, Shift>('g.shift')
      .each(updatePositions)
      .call(s => s.transition(t)
        .call(s => s.select('g.text').each(function (d) {
          const s = d3.select(this);
          const text = s.select<SVGGraphicsElement>('text');
          // .text((d: any) => formatName(employee));
          const dx = text.node().getBBox().width + 4;
          s.select('g.duration').attr('transform', `translate(${dx},0)`);
        }))
        .call(s => s.select('g.text')
          .attr('transform', (d: any) => `translate(${d.x+4},${-rowTextHeight})`)
        )
        .attr('transform', d => `translate(0,${d.y+currentOffset})`)
        .selectAll<SVGElement, ShiftComponent>('g.group')
          .attr('transform', d => `translate(${d.x},0)`)
          .call(s => s.select('rect')
            .attr('width', d => d.w)
            .attr('fill', d => d.fill.toString())
            .attr('stroke', d => d.fill.toString())
          )
          .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
          .each(filterShiftComponentTimeVisibility)
      );
  }

  const debouncedResized = debounce(resized, 200);

  function cleanup() {
    sub.unsubscribe();
    svg.select('g.axis.date').remove();
    window.removeEventListener('resize', debouncedResized);
  }

  window.addEventListener('resize', debouncedResized);
}

function byEmployee(employee: Employee, centerDate: Date) {
  const employeeId = employee['id'];
  let minDate = d3.timeWeek.floor(centerDate);
  let maxDate = d3.timeDay.offset(minDate, 7);

  const domain = d3.timeDay.range(minDate, maxDate).map(d => d.toISOString().slice(0, 10));
  const j = domain.indexOf(centerDate.toISOString().slice(0, 10));
  yScale = d3.scaleTime();
  yScale.domain([minDate, maxDate]).range([margin.top, height - margin.bottom]);
  yScaleCopy = yScale.copy();

  xScale = d3.scaleTime().range([margin.left, width - margin.right]);
  xScaleCopy = xScale.copy();

  let lastDomain = [minDate, maxDate];
  const updated = new BehaviorSubject(lastDomain);

  const sub = fancy(
    updated.pipe(map(v => [employeeId, v])),
    [employeeId, [minDate, maxDate]],
    worker.getShiftsByEmployeeInRange.bind(worker)
  ).subscribe(result => {
    const [{shifts, employees, employeeIds}, args] = result as any;
    lastDomain = args[1];
    const employee = employees[employeeIds[0]]; // uh
    draw(shifts, employee);
  });

  let nameTitle;
  if (nameTitle = svg.select('g.title.block')) {
    nameTitle = svg.append('g').classed('title block', true)
      .attr('transform', `translate(${width / 2},${margin.top / 2})`)
      .call(s => s.append('text').attr('text-anchor', 'middle').attr('alignment-baseline', 'middle'));
  }

  svg.call(zoom = d3.zoom()
      .scaleExtent([1, 100])
      .on('start', zoomStarted)
      .on('end', zoomEnded)
      .on('zoom', zoomed))

  function draw(shifts: Shift[], employee: Employee) {
    const t = d3.transition().duration(500);

    // uggggly
    const [minTime, maxTime] = d3.extent(shifts
      .reduce((acc, s) => {
        calculateNorms(s);
        for (const comp of s.components) {
          acc.push(comp.startNorm);
          acc.push(comp.endNorm);
        }
        return acc;
      }, [] as Date[]));

    const [minx, maxx] = xScale.range();
    const extent: [[number, number], [number,number]] = [
      [minx, -Infinity],
      [maxx, Infinity]
    ];
    zoom.translateExtent(extent);
  
    const text = `${formatName(employee)}:  Week of ${[minDate, maxDate].map(formatDateSimple).join(' - ')}`;
    nameTitle.select('text').text(text);

    xScale.domain([minTime, maxTime]);
    xScaleCopy = xScale.copy();

    topAxis.scale(xScale);
    bottomAxis.scale(xScale);

    const [a, b] = lastDomain.map(d => yScale(d));

    svg.select('#clip').select('rect.fg')
      .attr('transform', `translate(0,${a})`)
      .attr('height', b - a)
      .attr('width', '100%');
 
    svg.select('g.axis.top').attr('transform', `translate(0,${margin.top})`).call(topAxis)
      .call(s => s.select('path').remove())
      .call(s => s.selectAll('.tick').select('line').attr('y2', height - margin.top - 40));
    svg.select('g.axis.bottom').attr('transform', `translate(0,${height - 40})`).call(bottomAxis)
      .call(s => s.select('path').remove())
      .call(s => s.selectAll('.tick').select('line').remove());

    svg.select('g.shifts').selectAll<SVGElement, Shift>('g.shift').data(shifts, d => d._id).join(
      enter => enter.append('g')
        .each(updatePositions)
        .call(drawShift, bandwidth, {[employee.id]: employee})
        .each(function (d) {
          d3.select(this)
            .attr('opacity', 0)
            .attr('transform', `translate(0,${d.y - 40})`)
            .transition(t)
            .delay(200)
            .attr('opacity', 1)
            .attr('transform', `translate(0,${d.y})`);
        })
        .call(s => s.select('g.text')
          .each(function (d) {
            const s = d3.select(this);
            const text = s.select<SVGGraphicsElement>('text').text(formatDateWeekday(d.start));
            const dx = text.node().getBBox().width + 4;
            s.select('g.duration').attr('transform', `translate(${dx},0)`);
          })
        )
        .call(s => s.select('g.text').attr('transform', d => `translate(${d.x + 4},${-rowTextHeight})`))
        .call(s => s.selectAll<SVGElement, ShiftComponent>('g.group')
          .attr('transform', d => `translate(${d.x},0)`)
          .call(s => s.select('rect')
            .attr('width', d => d.w)
            .attr('fill', d => d.fill.toString())
            .attr('stroke', d => d.fill.toString())
          )
          .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
          .each(filterShiftComponentTimeVisibility)
        ),
      update => update
        .each(updatePositions)
        .call(s => s.selectAll('g.group').data(d => d.components)) // strange that this is required
        .call(s => s.transition(t).delay(100)
          .call(s => s.select('g.text')
            .each(function (d) {
              const s = d3.select(this);
              const text = s.select<SVGGraphicsElement>('text').text(formatDateWeekday(d.start));
              const dx = text.node().getBBox().width + 4;
              s.select('g.duration').attr('transform', `translate(${dx},0)`);
            })
          )
          .call(s => s.select('g.text').attr('transform', d => `translate(${d.x+4},${-rowTextHeight})`))
          .attr('transform', d => `translate(0,${d.y})`)
          .selectAll<SVGElement, ShiftComponent>('g.group')
          .attr('transform', d => `translate(${d.x},0)`)
          .call(s => s.select('rect')
            .attr('width', d => d.w)
            .attr('fill', d => d.fill.toString())
            .attr('stroke', d => d.fill.toString())
          )
          .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
          .each(filterShiftComponentTimeVisibility)
        ),
      exit => exit.attr('opacity', 1).transition(t).attr('opacity', 0).remove(),
    ).on('click', function (d) {
      d3.select(this).on('click', null);
      cleanup();
      byTime([d3.timeHour.offset(d.start, -4), d3.timeHour.offset(d.end != null ? d.end : d.start, 4)]);
    });
  }

  function updatePositions(shift: Shift) {
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

  let lastOffsetY = 0,
    currentOffset = 0,
    transform = d3.zoomIdentity;

  function manualTranslate(z) {
    let lastOffsetY = 0, currentOffset = 0, transform = d3.zoomIdentity;
    z.on('start', zoomStarted).on('end', zoomEnded).on('zoom', zoomed);
  }

  function zoomStarted() {
    const { sourceEvent } = d3.event;
    if (sourceEvent == null) return;
    lastOffsetY = sourceEvent.type == "touchstart" ? sourceEvent.touches[0].screenY : sourceEvent.offsetY;
  }

  function zoomEnded() {
    currentOffset = transform.y;
  }

  function zoomed() {
    xScale = d3.event.transform.rescaleX(xScaleCopy);

    // manually compute the drag distance and create zoom transform
    const { sourceEvent } = d3.event;
    let dy = 0;
    if (sourceEvent != null) {
      const {type, touches, offsetY } = sourceEvent; 
      dy = (type == 'touchmove' ? touches[0].screenY : offsetY) - lastOffsetY + currentOffset;
      // dy = Math.max(dy, 0);
      transform = d3.zoomIdentity.translate(0, dy);
      yScale = transform.rescaleY(yScaleCopy);
    }
    topAxis = topAxis.scale(xScale);
    bottomAxis = bottomAxis.scale(xScale);
    drawAxis();

    const [a, b] = lastDomain.map(d => yScale(d));
    svg.select('#clip').select('rect.fg')
      .attr('transform', `translate(0,${a})`)
      .attr('height', b - a)
      .attr('width', '100%');
 
    svg.select('g.shifts')
      .selectAll<SVGElement, Shift>('g.shift')
      .each(updatePositions)
      .attr('transform', d => `translate(0,${d.y})`)
      .call(s => s.select('g.text').attr('transform', d => `translate(${d.x + 4},${-rowTextHeight})`))
      .call(s => s.selectAll<SVGElement, ShiftComponent>('g.group')
        .attr('transform', d => `translate(${d.x},0)`)
        .call(s => s.select('rect')
          .attr('width', d => d.w)
          .attr('fill', d => d.fill.toString())
          .attr('stroke', d => d.fill.toString())
        )
        .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
        .each(filterShiftComponentTimeVisibility)
      );
    updated.next(yScale.domain());
  }

  function resized() {
    const t = d3.transition().duration(200);

    updateSize(); // update width / height vars
    const xRange = [margin.left, width - margin.right];
    xScale = xScale.range(xRange);
    xScaleCopy = xScale.copy();
    topAxis.scale(xScale);
    bottomAxis.scale(xScale);
    const [minx, maxx] = xRange;
    const extent: [[number, number], [number,number]] = [
      [minx, -Infinity],
      [maxx, Infinity]
    ];
    zoom = zoom.translateExtent(extent);
    // svg.transition(t).call(zoom.transform, d3.zoomIdentity)
 
    drawAxis();

    svg.select('g.shifts').selectAll<SVGElement, Shift>('g.shift')
      .each(updatePositions)
      .call(s => s.selectAll('g.group').data(d => d.components))
      .call(s => s.transition(t).delay(100)
        .call(s => s.select('g.text')
          .each(function (d) {
            const s = d3.select(this);
            const text = s.select<SVGGraphicsElement>('text').text(formatDateWeekday(d.start));
            const dx = text.node().getBBox().width + 4;
            s.select('g.duration').attr('transform', `translate(${dx},0)`);
          })
        )
        .call(s => s.select('g.text').attr('transform', d => `translate(${d.x+4},${-rowTextHeight})`))
        .attr('transform', d => `translate(0,${d.y})`)
        .selectAll<SVGElement, ShiftComponent>('g.group')
        .attr('transform', d => `translate(${d.x},0)`)
        .call(s => s.select('rect')
          .attr('width', d => d.w)
          .attr('fill', d => d.fill.toString())
          .attr('stroke', d => d.fill.toString())
        )
        .call(s => s.select('text.time.end').attr('x', d => d.w - 4))
        .each(filterShiftComponentTimeVisibility)
      );

  }

  const debouncedResized = debounce(resized, 200);

  function cleanup() {
    sub.unsubscribe();
    svg.select('g.title.block').remove();
    window.removeEventListener('resize', debouncedResized);
  }

  window.addEventListener('resize', debouncedResized);
}

function filterShiftComponentTimeVisibility(d) {
  const {w} = d;
  const sel = d3.select(this);
  sel.select('text.time.start')
    .attr('opacity', w > 120 ? 1 : 0);
  sel.select('text.time.end')
    .attr('opacity', w > 200 ? 1 : 0);
}

function drawStrokeAnimation(sel, colors: string[]) {
  const values = [...colors, colors[0]].join(';');
  return sel.append('animate')
    .attr('attributeType', 'XML')
    .attr('attributeName', 'stroke')
    .attr('values', values)
    .attr('dur', '1.2s')
    .attr('repeatCount', 'indefinite');
}

function drawShift(sel, bandwidth, employees) {
  return sel
    .classed('shift', true)
    .attr('cursor', 'pointer')
    // shift label
    .call(s => s.append('g').classed('text', true)
      .call(s => s.append('text')
        .classed('shift-label', true)
        .attr('y', 10)
        .attr('text-anchor', 'start')
        .attr('alignment-baseline', 'bottom')
        .text(d => formatName(employees[d.employee]))
      )
      .filter(d => d.started)
      .call(s => s.append('g').classed('duration', true)
        .each(function (d) {
          const dx = (this.previousSibling as SVGGraphicsElement).getBBox().width + 4;
          d3.select(this)
            .attr('transform', `translate(${dx},0)`)
            .call(drawMiniPie, d.duration / d.expectedDuration, d.employee);
        })
        .call(s => s.append('text')
          .attr('x', 24)
          .attr('y', 10)
          .attr('alignment-baseline', 'bottom')
          .text(d => `${formatDuration(d.duration)}`)
        ),
      )
    )
    // shift components
    .call(s => s.selectAll('g.group').data(d => d.components).enter().append('g').classed('group', true)
      .call(s => s.append('rect').attr('stroke-width', 4).attr('height', bandwidth).attr('rx', 8))
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
      .each(function (d) {
        if (d.type == ShiftComponentType.Actual && d.state == ShiftState.Incomplete) {
          d3.select(this).select('rect').call(drawStrokeAnimation, [d.fill.hex(), '#fff']);
        }
      })
    );
}

const arc = d3.arc();
function drawMiniPie(sel, frac: number, employeeColor: EmployeeShiftColor, radius = 10) {
  const c = employeeColorScale(employeeColor.toString());
  const endAngle = 2 * Math.PI * Math.min(Math.max(frac, 0), 1);
  const startAngle = 0;
  return sel.append('g')
    .attr('transform', `translate(${radius},${radius/2})`)
    .call(s => s.append('circle').attr('r', 10).attr('fill', c[1]))
    .call(s => s.append('path').attr('fill', c[0])
      .attr('d', d => arc({ startAngle, endAngle, outerRadius: radius, innerRadius: 0 })));
}

function drawButton(text: string, [w, h]: [number, number]) {
  return svg.append('g')
    .classed('button', true)
    .call(g => g.append('rect')
      .attr('rx', 8)
      .attr('width', w)
      .attr('height', h))
    .call(g => g.append('text')
      .attr('user-select', 'none')
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .attr('x', w / 2)
      .attr('y', h / 2)
      .text(text)
    );
}

function drawAxis() {
  svg.select('g.axis.top').attr('transform', `translate(0,${margin.top})`).call(topAxis)
    .call(s => s.select('path').remove())
    .call(s => s.selectAll('.tick').select('line').attr('y2', height - margin.top + 20 - margin.bottom));
  svg.select('g.axis.bottom').attr('transform', `translate(0,${height - margin.bottom})`).call(bottomAxis)
    .call(s => s.select('path').remove())
    .call(s => s.selectAll('.tick').select('line').remove());

  interface DateLabel {
    date: Date;
    id: string;
  }

  const labels: DateLabel[] = [];
  const [minDate, maxDate] = xScale.domain();
  const spacing = xScale(d3.timeDay.offset(minDate, 1)) - xScale(minDate);
  const stickyCenter = +maxDate - +minDate < 8.64e7; // center label if less than 1 day visible

  for (
    let date = d3.timeDay.floor(minDate);
    date < maxDate;
    date = d3.timeDay.offset(date, 1)
  ) labels.push({ id: date.toISOString().slice(0, 10), date });

  svg.select('g.axis.date').selectAll<SVGElement, DateLabel>('g').data(labels, d => d.id)
    .join(
      enter => enter.append('g').call(s => s.append('text').classed('date-label', true).text(d => formatDateWeekday(d.date))),
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
      return `translate(${x},${margin.top / 2})`;
    });
}

function fancy<T1 extends Array<any>, T2>(input: Observable<T1>, first: T1, fn: (...args: T1[]) => Promise<[T2, T1]>) {
  return input.pipe(
    auditTime(500),
    // throttleTime(200), // start new fetch new range at most every .1s
    // startWith(first),
    scan(([_, index], value) => [value, index + 1], [null, -1]), // yuck
    switchMap(([args, index]: [T1, number]) => fn(...args).then(result => [result, index, args])),
    audit(([value, index]) => timer(index > 0 ? 600 : 0)), // only update screen at most once a second
    map(([value, index, args]) => [value, args]),
  );
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

function formatDateSimple(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d}`;
}

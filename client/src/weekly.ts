declare const GENERATE_MOCKING: boolean;
import * as d3 from 'd3';
import {group} from 'd3-array';
import { fromEvent } from 'rxjs';
import { switchMap, map, throttleTime } from 'rxjs/operators';
import * as Comlink from 'comlink';

const worker = Comlink.wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;


const svg = d3.select(document.body).append('svg');

const weekRows = 52; // how many rows to show initially;
const weekRowHeight = 80; // px
const weekRowStep = 100; // px

const margin = {top: 80, right: 40, left: 80, bottom: 80};
const {innerWidth: width, innerHeight: height} = window;
const bottomPadding = Math.ceil((height / 2 - weekRowStep / 2) / weekRowStep) * weekRowStep;

const totalHeight = weekRowStep * weekRows + bottomPadding;

const now = new Date();
const week = d3.timeWeek.floor(now);

const yScale = d3.scaleTime()
  .range([0, totalHeight])
  .domain([d3.timeWeek.offset(week, -weekRows), d3.timeWeek.offset(week, bottomPadding / weekRowStep)]);

const axis = d3.axisLeft(yScale).ticks(d3.timeWeek.every(1));
svg.attr('width', '100%').attr('height', totalHeight);
svg.append('g').attr('transform', `translate(80,${weekRowHeight / 2})`).call(axis);
const g = svg.append('g');
const args = {top: weekRowStep * weekRows};
window.scrollTo(args);
window.onbeforeunload = () => window.scrollTo(args);

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
  fromEvent(window, 'scroll').pipe(
    map(() => [window.scrollY, window.scrollY + window.innerHeight].map(g => yScale.invert(g))),
    map(([minDate, maxDate]) => [d3.timeWeek.floor(minDate), d3.timeWeek.ceil(maxDate)]),
    throttleTime(200),
    switchMap(range => worker.getWeeklyGraphData(range)),
    map(items => group(items as any[], d => d3.timeWeek.floor(d.date).toISOString().slice(0, 10))),
  ).subscribe((filteredData: Map<string, any[]>) => {
    const xScale = d3.scaleLinear().domain([0, 10]).range([weekRowHeight, 0]);
    const line = d3.line().curve(d3.curveStep).y((d: any) => xScale(d.count))
  
    const data = Array.from(filteredData.entries()).map(([key, value]) => {
      const [y, m, d] = key.split('-').map(s => +s);
      const date = new Date(y, m-1, d);
      return [date, value];
    });
    console.log(data);
    g.selectAll('g').data(data, ([key, value]) => key).join(
      enter => enter.append('g')
        // .call(s => s.append('rect').attr('height', weekRowHeight).attr('width', 400))
        .attr('transform', ([key, value]) => `translate(0,${yScale(key as any)})`)
        .call(s => s.append('path')
          .attr('d', ([key, value]: any) => {
            const domain = [key, d3.timeWeek.offset(key, 1)];
            const scale = d3.scaleTime()
              .domain(domain)
              .range([margin.left, width - margin.right]);
            value.unshift({...value[0], count: 0})
            value.push({...value[value.length - 1], count: 0})
            return line.x((d: any) => scale(d.date))(value);
          })
          .attr('fill', 'lightgrey')
          .attr('stroke', 'black')
        )
      , update => update
      , exit => exit.remove(),
    ).sort((a, b) => d3.ascending(a[0] as any, b[0] as any));
});


})();

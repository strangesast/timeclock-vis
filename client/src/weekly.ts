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

const margin = {top: 80, right: 40, left: 40, bottom: 80};
const {innerWidth: width, innerHeight: height} = window;
const bottomPadding = Math.ceil((height / 2 - weekRowStep / 2) / weekRowStep) * weekRowStep;

const totalHeight = weekRowStep * weekRows + bottomPadding;

const now = new Date();
const week = d3.timeWeek.floor(now);

const yScale = d3.scaleTime()
  .range([0, totalHeight])
  .domain([d3.timeWeek.offset(week, -weekRows), d3.timeWeek.offset(week, bottomPadding / weekRowStep)]);

svg.attr('width', '100%').attr('height', totalHeight);
const args = {top: weekRowStep * weekRows};
window.scrollTo(args);
window.onbeforeunload = () => window.scrollTo(args);

fromEvent(window, 'scroll').pipe(
  throttleTime(100),
  map(() => [window.scrollY, window.scrollY + window.innerHeight].map(g => yScale.invert(g))),
  switchMap(range => worker.getWeeklyGraphData(range)),
  map(items => group(items as any[], d => d3.timeWeek.floor(d.date).toISOString().slice(0, 10))),
).subscribe((filteredData: Map<string, any[]>) => {

  const a = d3.timeWeek.floor(new Date());
  const b = d3.timeMinute.offset(d3.timeWeek.offset(a, 1), 15);
  const domain = d3.timeMinute.every(15).range(a, b).map((d, i) => ((d.getDay() * 24 * 60 + d.getHours() * 60 + d.getMinutes()) / 15).toString());
  console.log(domain);
  const bandScale = d3.scaleBand()
    .domain(domain)
    .range([margin.left, width - margin.right])
    .padding(0.1);

  // const maxCount = d3.max(Array.from(filteredData.values()).reduce((a, b) => a.concat(b), []), (d: any) => d.count)
  const xScale = d3.scaleLinear().domain([0, 10]).range([0, weekRowHeight]);

  const data = Array.from(filteredData.entries())
  svg.selectAll('g').data(data, ([key, value]) => key).join(
    enter => enter.append('g')
      // .call(s => s.append('rect').attr('height', weekRowHeight).attr('width', 400))
      .attr('transform', ([key, value]) => `translate(0,${yScale(new Date(key))})`)
    , update => update
    , exit => exit.remove(),
  )
    .selectAll('rect')
    .data(([key, value]) => value, (d: any) => d.date.toISOString())
    .join(
      enter => enter.append('rect')
        .attr('x', (d: any, i) => {
          const v = ((d.date.getDay() * 24 * 60 + d.date.getHours() * 60 + d.date.getMinutes()) / 15).toString();
          return bandScale(v);
        })
        .attr('height', (d: any) => xScale(d.count))
        .attr('y', (d: any) => weekRowHeight - xScale(d.count))
        .attr('width', bandScale.bandwidth()).on('mouseenter', d => console.log(d)),
      update => update,
      exit => exit.remove(),
    )

});

const data = [];
for (let i = -52; i < bottomPadding / weekRowStep; i++) {
  const date = d3.timeWeek.offset(week, i);
  const id = date.toISOString().slice(0, 10);
  data.push({date, id});
}


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

  const minDate = d3.timeWeek.offset(d3.timeWeek.floor(new Date()), -2);
  const content = await worker.getWeeklyGraphData([minDate, d3.timeWeek.offset(minDate, 1)]);
  console.log(content);
  // d3.group(data, d => dkj:t
  // console.log('data', content);
})();

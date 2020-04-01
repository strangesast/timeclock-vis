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

const {innerWidth: width, innerHeight: height} = window;
console.log(width, height);
// go back 52 

const bottomPadding = Math.ceil((height / 2 - weekRowStep / 2) / weekRowStep) * weekRowStep;

const totalHeight = weekRowStep * weekRows + bottomPadding;
// page height
//


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

  const bandScale = d3.scaleBand()
    .domain(Array.from(Array(d3.max(Array.from(filteredData.values() as any), (d: any) => d.length))).map((_, i) => i.toString()))
    .range([0, width])
    .padding(0.1);
  const xScale = d3.scaleLinear().domain([0, d3.max(Array.from(filteredData.values()).reduce((a, b) => a.concat(b), []), (d: any) => d.count)]).range([0, weekRowHeight]);

  const data = Array.from(filteredData.entries())
  svg.selectAll('g').data(data).join(
    enter => enter.append('g')
      // .call(s => s.append('rect').attr('height', weekRowHeight).attr('width', 400))
      .attr('transform', ([key, value]) => `translate(0,${yScale(new Date(key))})`)
    , update => update
    , exit => exit.remove(),
  )
    .selectAll('rect')
    .data(([key, value]) => value)
    .join(
      enter => enter.append('rect')
        .attr('x', (d: any, i) => bandScale(i.toString()))
        .attr('y', (d: any) => xScale(d.count))
        .attr('height', (d: any) => weekRowHeight - xScale(d.count))
        .attr('width', bandScale.bandwidth()),
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

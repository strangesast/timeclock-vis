import * as d3 from 'd3';
import { fromEvent } from 'rxjs';
import { map, throttleTime } from 'rxjs/operators';

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
  map(([a, b]) => data.filter(d => d.date > a && d.date <= b))
).subscribe(filteredData => {
  svg.selectAll('g').data(filteredData, ({id}) => id).join(
    enter => enter.append('g')
      .call(s => s.append('rect').attr('height', weekRowHeight).attr('width', 400))
      .attr('transform', d => `translate(0,${yScale(d.date)})`)
    , update => update
    , exit => exit.remove(),
  )
});

const data = [];
for (let i = -52; i < bottomPadding / weekRowStep; i++) {
  const date = d3.timeWeek.offset(week, i);
  const id = date.toISOString().slice(0, 10);
  data.push({date, id});
}

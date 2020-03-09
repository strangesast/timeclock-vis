declare const GENERATE_MOCKING: boolean;
import * as d3 from 'd3';
import { Employee } from './models';
import { formatName } from './util';
import * as Comlink from 'comlink';

const worker = Comlink.wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;

const [width, height] = [1000, 1000];

const svg = d3.select(document.body).append('svg')
  .attr('width', '100%')
  .attr('height', '100%')
  .attr('viewBox', [-10, -10, width + 10 * 2, height + 10 * 2].join(' '));

// svg.append('rect').attr('width', width).attr('height', height);

const innerRadius = 100;
const outerRadius = 200;

// const x = d3.scaleBand().range([0, 2 * Math.PI]).align(0);
// const y = d3.scaleLinear()
//     .range([innerRadius * innerRadius, outerRadius * outerRadius]);

const margin = {top: 80, bottom: 40, left: 40, right: 200};
const x = d3.scaleBand().range([margin.left, width - margin.right]);
const y = d3.scaleLinear().range([height - margin.bottom, margin.top]);

const colors = d3.schemePaired.slice(0, 10).filter((_, i) => i % 2 == 1);
const colorScale = d3.scaleOrdinal<string>()
  .range(colors)
  .domain(colors.map((_, i) => i.toString()));

svg.append('g').classed('data', true);
svg.append('g').classed('axis bottom', true);
svg.append('g').classed('legend', true);

(async function () {
  // const url = new URL(`/data/graph`, location.origin);
  // const res = await fetch(url.toString())
  // const content = await res.json();

  let now;
  if (GENERATE_MOCKING) {
    now = d3.timeWeek.floor(new Date());
    now.setDate(now.getDate() + 3);
    now.setHours(14, 22, 0, 0);
  
    await worker.initializeData(now);
  } else {
    now = new Date();
  }
 
  const content = await worker.getGraphData();

  const columns = content['columns'];

  x.domain(columns);

  svg.select('g.axis.bottom').call(d3.axisBottom(x)).attr('transform', `translate(0, ${height - margin.bottom})`);

  let data = content['data'];
  const cumTotal = data.reduce((acc, {total}) => Math.max(acc, total), 0);

  y.domain([0, cumTotal]);
  const employeeIds: string[] = [];
  const employeeMap = {};
  const employees = content['employees'] as Employee[];
  for (const empl of employees) {
    const employeeId = empl['id'];
    employeeIds.push(employeeId);
    employeeMap[employeeId] = empl;
  }
  const stack = d3.stack().keys(employeeIds)
    .value((d, key) => {
      return d.buckets[key] || 0;
    });
  
  data = data.sort((a, b) => b.total - a.total);
  const series = stack(data).map(d => (d.forEach((v: any) => v.key = d.key), d));

  const g = svg.select('g.data').selectAll('g').data(series)
    .join('g') as any

  const graph = g.attr('fill', d => colorScale(d.key))
    .selectAll('rect')
    .data(d => d)
    .join('rect')
    .attr('y', d => y(d[1]))
    .attr('height', d => y(d[0]) - y(d[1]))
    .attr('width', x.bandwidth())
    .attr('x', (d: any) => x(d['data']['_id']))

  svg.select('g.legend')
    .call(s => s.append('rect').attr('width', 200).attr('height', employees.length * 20).attr('fill', 'transparent'))
    .attr('transform', `translate(${width - 200},${margin.top})`)
    .selectAll<SVGGraphicsElement, Employee>('g')
    .data(employees, d => d['id'])
    .join(
    enter => enter.append('g')
      .style('cursor', 'pointer')
      .attr('transform', (d, i) => `translate(0,${i * 20})`)
      .call(s => s.append('rect')
        .attr('fill', d => colorScale(d.id))
        .attr('width', 18)
        .attr('height', 18)
      )
      .call(s => s.append('text')
        .attr('x', 24)
        .attr('y', 10)
        .attr('alignment-baseline', 'middle')
        .text(d => formatName(d)))
    , update => update
    , exit => exit.remove(),
  )
    .on('mouseenter', d => {
      svg.select('g.data').selectAll('g').attr('opacity', (_d: any) => _d['key'] != d.id ? 0.7 : 1);
    })
    .on('click', d => {
      svg.select('g.data').selectAll('g').data(series.filter(_d => _d.key == d.id))
        .join('g')
        .attr('fill', d => colorScale(d.key))
        .attr('opacity', 1)
        .selectAll('rect')
        .data(d => d)
        .join('rect')
        .each(function (d: any) {
          const h = y(d[0]) - y(d[1]);
          const dy = height - margin.bottom - h;
          const dx = x(d['data']['_id']);
          d3.select(this).attr('y', dy).attr('height', h).attr('x', dx);
        })
        .attr('width', x.bandwidth())
    })
  svg.select('g.legend').on('mouseleave', d => {
    svg.select('g.data').selectAll('g').data(series)
      .join('g')
      .attr('fill', d => colorScale(d.key))
      .selectAll('rect')
      .data(d => d)
      .join('rect')
      .attr('y', d => y(d[1]))
      .attr('height', d => y(d[0]) - y(d[1]))
      .attr('width', x.bandwidth())
      .attr('x', (d: any) => x(d['data']['_id']))
  });
})();
// d => Math.sqrt(y(d)), y

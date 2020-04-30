declare const GENERATE_MOCKING: boolean;
import * as d3 from 'd3';
import { Employee, GraphDataResponse } from './models';
import { formatName } from './util';
import * as Comlink from 'comlink';

const worker = Comlink.wrap(new Worker('./worker.js', { type: 'module' })) as any;

const [width, height] = [1000, 1000];

const svg = d3.select(document.body).append('svg')
  .attr('width', '100%')
  .attr('height', '100%')
  .attr('viewBox', [-10, -10, width + 10 * 2, height + 10 * 2].join(' '));

// svg.append('rect').attr('width', width).attr('height', height);

const innerRadius = 100;
const outerRadius = 200;

const exclude = ['70', '67', '51', '74', '79', '57', '80'];

const margin = {top: 80, bottom: 40, left: 40, right: 200};

const colors = d3.schemePaired.slice(0, 10).filter((_, i) => i % 2 == 1);
const colorScale = d3.scaleOrdinal<string>()
  .range(colors)
  .domain(colors.map((_, i) => i.toString()));

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
 
  const content = await worker.getGraphData() as GraphDataResponse;

  flat(content);
})();

function round(
  {columns, data, employees}: {
    columns: string[],
    data: {_id: string, total: number, buckets: {[key: string]: number}}[],
    employees: Employee[],
  }) {

  if (svg.select('g.axis.bottom').empty()) {
    svg.append('g').classed('axis bottom', true);
  }
  if (svg.select('g.legend').empty()) {
    svg.append('g').classed('legend', true);
  }
  if (svg.select('g.data').empty()) {
    svg.append('g').classed('data', true);
  }

  const x = d3.scaleBand()
    .domain(columns)
    .range([0, 2 * Math.PI])
    .align(0)

  const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.total)])
      .range([innerRadius * innerRadius, outerRadius * outerRadius]);
  Object.assign(d => Math.sqrt(y(d)), y);

  const arc = d3.arc()
    .innerRadius(d => y(d[0]))
    .outerRadius(d => y(d[1]))
    .startAngle(d => x(d['data']['_id']))
    .endAngle(d => x(d['data']['_id']) + x.bandwidth())
    .padAngle(0.01)
    .padRadius(innerRadius)

  let employeeIds: string[] = [];
  const employeeMap = {};
  for (const empl of employees) {
    const employeeId = empl['id'];
    employeeIds.push(employeeId);
    employeeMap[employeeId] = empl;
  }

  // employeeIds = employeeIds.sort((a, b) => !exclude.includes(a) ? 1 : -1);

  const stack = d3.stack()
    .keys(employeeIds)
    .value((d, key) => d.buckets[key] || 0);

  const cumTotal = data.reduce((acc, {total}) => Math.max(acc, total), 0);
  y.domain([0, cumTotal]);

  const series = stack(data as any[]).map(d => (d.forEach((v: any) => v.key = d.key), d));

  svg.select('g.data').selectAll('g').data(series)
    .join('g')
    .attr('fill', (d: any) => colorScale(d.key))
    .selectAll('path')
    .data(d => d)
    .join('path')
    .attr('d', arc as any);
}


function flat(
  {columns, data, employees}: {
    columns: string[],
    data: {_id: string, total: number, buckets: {[key: string]: number}}[],
    employees: Employee[],
  }) {

  if (svg.select('g.axis.bottom').empty()) {
    svg.append('g').classed('axis bottom', true);
  }
  if (svg.select('g.legend').empty()) {
    svg.append('g').classed('legend', true);
  }
  if (svg.select('g.data').empty()) {
    svg.append('g').classed('data', true);
  }

  const x = d3.scaleBand().range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().range([height - margin.bottom, margin.top]);
  const bottomAxis = d3.axisBottom(x)
    .tickFormat(d => {
      const v = parseFloat(d) / 2;
      const k = Math.floor(v);
      return `${k}:${('0' + ((v - k) * 60)).slice(-2)}`;
    });

  x.domain(columns);

  bottomAxis.tickValues(columns.filter((_, i) => i % 4 == 0))

  svg.select('g.axis.bottom').call(bottomAxis).attr('transform', `translate(0, ${height - margin.bottom})`);

  let employeeIds: string[] = [];
  const employeeMap = {};
  for (const empl of employees) {
    const employeeId = empl['id'];
    employeeIds.push(employeeId);
    employeeMap[employeeId] = empl;
  }

  // employeeIds = employeeIds.sort((a, b) => !exclude.includes(a) ? 1 : -1);

  const stack = d3.stack()
    .keys(employeeIds)
    .value((d, key) => d.buckets[key] || 0);

  const cumTotal = data.reduce((acc, {total}) => Math.max(acc, total), 0);
  y.domain([0, cumTotal]);

  const series = stack(data as any[]).map(d => (d.forEach((v: any) => v.key = d.key), d));

  function draw() {
    svg.select('g.data').selectAll('g').data(series)
      .join('g')
      .attr('fill', (d: any) => colorScale(d.key))
      .selectAll('rect')
      .data(d => d)
      .join('rect')
      .each(function (d) {
        const s = d3.select(this);
        const b = d['data']['_id'] as unknown;
        const [y0, y1] = d.map(v => y(v));
        // const dy = y1 - y(d.data.total) / 2;
        const dy = y1;
        const dx = x(b as string);
        s.attr('y', dy)
          .attr('height', y0 - y1)
          .attr('x', dx)
          .attr('width', x.bandwidth())
      })
  }

  draw();

  svg.select('g.legend')
    .on('mouseleave', d => draw())
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
      svg.select('g.data').selectAll('g').data(series.filter((_d: any) => _d.key == d.id))
        .join('g')
        .attr('fill', (d: any) => colorScale(d.key))
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
    });
};
// d => Math.sqrt(y(d)), y

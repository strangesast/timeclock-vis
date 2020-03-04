import * as d3 from 'd3';


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

const margin = {top: 80, bottom: 40, left: 40, right: 40};
const x = d3.scaleBand().range([margin.left, width - margin.right]);
const y = d3.scaleLinear().range([height - margin.bottom, margin.top]);

const colors = d3.schemePaired.slice(0, 10).filter((_, i) => i % 2 == 1);
const colorScale = d3.scaleOrdinal()
  .range(colors)
  .domain(colors.map((_, i) => i.toString()));

svg.append('g').classed('data', true);
svg.append('g').classed('axis bottom', true);

(async function () {
  const url = new URL(`/data/graph`, location.origin);
  const res = await fetch(url.toString())
  const content = await res.json();

  const columns = content['columns'];

  y.domain([0, 1400]);
  x.domain(columns);

  svg.select('g.axis.bottom').call(d3.axisBottom(x)).attr('transform', `translate(0, ${height - margin.bottom})`);

  let data = content['data'];
  const employeeIds = [];
  const employeeMap = {};
  for (const empl of content['employees']) {
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
  console.log(series);

  const g = svg.select('g.data').selectAll('g').data(series)
    .join('g') as any

  g.attr('fill', d => colorScale(d.key))
    .selectAll('rect')
    .data(d => d)
    .join('rect')
    .attr('y', d => y(d[1]))
    .attr('height', d => y(d[0]) - y(d[1]))
    .attr('width', x.bandwidth())
    .attr('x', (d: any) => x(d['data']['_id']))
})();
// d => Math.sqrt(y(d)), y

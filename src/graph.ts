import * as d3 from 'd3';


const [width, height] = [1000, 1000];
const margin = 10;

const svg = d3.select(document.body).append('svg')
  .attr('width', '100%')
  .attr('height', '100%')
  .attr('viewBox', [-margin, -margin, width + margin * 2, height + margin * 2].join(' '));

// svg.append('rect').attr('width', width).attr('height', height);

const innerRadius = 100;
const outerRadius = 200;

const x = d3.scaleBand().range([0, 2 * Math.PI]).align(0);
const y = d3.scaleLinear()
    .range([innerRadius * innerRadius, outerRadius * outerRadius]);
// d => Math.sqrt(y(d)), y

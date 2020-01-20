import * as d3 from 'd3';
import {wrap} from 'comlink';
import { colors } from './util';

const worker = wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;

async function main() {
  const svg = d3.select('svg');


  const now = new Date();

  let width, height;

  const headerHeight = 100;
  const rowHeight = 40;
  const rowPadding = 2;

  const employees = await worker.getEmployees();

  ({width, height} = (svg.node() as any).getBoundingClientRect());

  svg.append('g').classed('employees', true).selectAll('g.employee').data(employees, (d: any) => d.id).join(
    enter => {
      const sel = enter.append('g').classed('employee', true);
      const w = width / 2;
      sel.append('rect')
        .attr('fill', colors.darkBlue)
        .attr('width', w)
        .attr('height', rowHeight - rowPadding);
      sel.append('text').attr('y', rowHeight / 2).attr('x', w / 2).text((d: any) => d.name.first + ' ' + d.name.last);
      sel.attr('transform', (d, i) => `translate(${width / 2 - w / 2},${rowHeight * i})`);
      return sel;
    },
    update => update,
    exit => exit.remove(),
  );





  const rowCount = Math.floor(height / rowHeight + 1);

  const today = d3.timeDay.floor(now);
  const end = d3.timeDay.offset(today, rowCount);
  const y = d3.scaleTime().domain([today, end]).range([headerHeight, height]);

  const midnight = new Date(2000, 0, 1);
  const x = d3.scaleTime().domain([midnight, d3.timeDay.offset(midnight, 1)]).range([headerHeight, height]);

  const ids = [80];

  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 14);

  const records = await worker.getEmployeeShifts(ids, [fromDate, toDate]);

  svg.append('g').classed('records', true).selectAll('.record').data(records, (d: any) => d.id).join(
    enter => {
      const sel = enter.append('g')
      sel.append('rect');
      return sel;
    },
    update => update,
    exit => exit.remove(),
  );
}

document.addEventListener('DOMContentLoaded', main);

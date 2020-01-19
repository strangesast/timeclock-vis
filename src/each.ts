import * as d3 from 'd3';
import {wrap} from 'comlink';

const worker = wrap(new Worker('./data.worker.ts', { type: 'module' })) as any;

async function main() {
  const svg = d3.select('svg');

  const employees = await worker.getEmployees();

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

import * as d3 from 'd3';
import { formatTime } from './util';

const svg : d3.Selection<SVGElement, {}, HTMLElement, any> = d3.select('svg');


enum ShiftState {
  Complete = 'complete',
  Incomplete = 'incomplete',
}
interface ShiftComponent {
  start: Date;
  end: Date;
  duration: number;
  state: ShiftState;
  employeeId: string; // needed for fill (gay)
}

interface Shift {
  id: string;
  employee: {
    id: string;
    name: string;
  }
  components: ShiftComponent[];
  punches: {
    date: Date
  }[],
}

interface DataSet {
  shifts: Shift[];
  employeeIds: string[];
}

const today = new Date();
today.setHours(0, 0, 0, 0);

let width, height;
const yScale = d3.scaleBand().padding(0.3);
const xScale = d3.scaleTime();
const axis = d3.axisTop(xScale);
const colorScale = d3.scaleOrdinal(d3.schemePaired);

svg.append('g').classed('axis', true).call(axis);
  
{
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(today);
  start.setHours(4);
  xScale.domain([start, tomorrow]);
}

function size() {
  ({ width, height } = svg.node().getBoundingClientRect());
  xScale.range([0, width]);
  yScale.range([40, height]);
}

function main({employeeIds, shifts}: DataSet) {
  const a = svg.select('g.axis').attr('transform', `translate(0,${40})`).call(axis);
  a.select('path').remove();
  a.selectAll('.tick').select('line').attr('y2', '100%');

  yScale.domain(employeeIds);
  colorScale.domain(employeeIds);
  //.range(Array.from(Array(employeeIds.length)).map((_, i) => headerHeight + rowPadding / 2 + i * rowHeight));

  const bandwidth = yScale.bandwidth();
  svg.selectAll<SVGElement, Shift>('g.shift').data(shifts, d => d.id)
    .join(
      enter => enter.append('g').classed('shift', true)
        .call(s => s.append('g')
          .attr('transform', d => `translate(${xScale(d.components[0].start)+4},-20)`)
          .call(s => s.append('rect').attr('fill', 'white').attr('width', 120).attr('height', 20))
          .call(s => s.append('text')
            .attr('y', 4)
            .attr('text-anchor', 'start')
            .attr('alignment-baseline', 'hanging')
            .text(d => d.employee.name)
          )
        )
        .call(s => s.selectAll('g.group').data(d => d.components).enter().append('g').classed('group', true)
          .call(e => e.append('rect').attr('height', bandwidth).attr('rx', 8))
          .call(e => e.append('text').attr('alignment-baseline', 'middle').attr('y', bandwidth / 2))
        ),
      update => update,
      exit => exit.remove(),
    )
    .attr('transform', shift => `translate(${0},${yScale(shift.employee.id)})`)
    .call(s => s.selectAll<SVGElement, ShiftComponent>('g.group')
      .attr('transform', d => `translate(${xScale(d.start)},0)`)
      .call(s => s.select('rect')
        .attr('width', d => xScale(d.end) - xScale(d.start))
        .attr('fill', d => colorScale(d.employeeId))
      )
      .call(s => s.select('text').attr('x', 4).text(d => formatTime(d.start)))

    );
  console.log(`width: ${width}`);
}

const employees = Array.from(Array(10)).map((_, i) => ({
  id: `${i}`,
  name: `Employee ${i + 1}`,
}));


const shifts: Shift[] = employees.map((employee, i) => {
  const h = Math.floor((6 + (i / employees.length) * 10) * 2) / 2
  const punches = Array.from(Array(4));
  punches[0] = new Date(today);
  punches[0].setHours(h);

  punches[1] = new Date(punches[0]);
  punches[1].setHours(punches[1].getHours() + 4);

  punches[2] = new Date(punches[1]);
  punches[2].setHours(punches[2].getHours(), punches[2].getMinutes() + 30);

  punches[3] = new Date(punches[2]);
  punches[3].setHours(punches[3].getHours() + 4);

  const components = Array.from(Array(2));
  components[0] = {start: punches[0], end: punches[1], duration: punches[1] - punches[0], employeeId: employee.id};
  components[1] = {start: punches[2], end: punches[3], duration: punches[3] - punches[2], employeeId: employee.id};

  return {
    id: `${i}`,
    employee,
    components,
    punches: punches.map(date => ({date})),
  };
});

size();
main({shifts, employeeIds: employees.map(empl => empl.id)});

import * as d3 from 'd3';

const svg : d3.Selection<SVGElement, {}, HTMLElement, any> = d3.select('svg');

const { width, height } = svg.node().getBoundingClientRect();

enum ShiftState {
  Complete = 'complete',
  Incomplete = 'incomplete',
}

interface Shift {
  id: string;
  employee: {
    id: string;
    name: string;
  }
  components: {
    start: Date;
    end: Date;
    duration: number;
    state: ShiftState;
  }[];
  punches: {
    date: Date
  }[],
}
const shifts: Shift[] = [
  ...Array.from(Array(20)).map((_, i) => ({id: i.toString(), employee: {name: `Employee ${i+1}`, id: i.toString()}, components: [], punches: []})),
];

svg.selectAll<SVGElement, Shift>('g.shift').data(shifts, d => d.id).join(
  enter => enter.append('g').classed('shift', true).call(s =>
    s.append('rect')
  ),
  update => update,
  exit => exit.remove(),
);

console.log(width, height);

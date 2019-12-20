import * as d3 from 'd3';

const body = d3.select(document.body);

const svg = body.select('svg');


const colors = {
    lightBlue: '#cfe2f3',
};

function draw() {
    const topBar = svg.append('g').classed('top-bar', true);
    topBar.append('rect').attr('fill', colors.lightBlue);
    // current time
    topBar.append('g').classed('current-time', true).append('text')
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'middle');

    const padding = 8;
    const timeScale = d3.scaleTime();
    let now, width, height, innerWidth;

    function updateTimeScale() {
        now = new Date();
        const [a, b] = [addHours(now, -2), addHours(now, 2)];
        timeScale.domain([a, b]).range([0, width]);
    }

    function updateDimensions() {
        ({width, height} = (svg.node() as SVGElement).getBoundingClientRect());
        innerWidth = width - padding * 2;
    }

    function redraw() {
        updateDimensions();
        updateTimeScale();

        const topBarHeight = 80;
        topBar.select('rect').attr('width', width).attr('height', topBarHeight);

        topBar.select('g.current-time')
          .attr('transform-origin', 'center center')
          .attr('transform', `translate(${[width/2, topBarHeight/2].toString()})`)
          .select('text')
          .attr('font-size', 30)
          .text(formatHours(now));
    }

    redraw();

    const debounceRedraw = debounce(redraw);

    window.addEventListener('resize', () => {
        debounceRedraw();
    });
};

function debounce(fn, time = 100) {
    let i = null;
    return function(now = false) {
        clearTimeout(i);
        if (now) {
            fn();
            return;
        }
        i = setTimeout(() => {
            fn();
        }, time);
    }
}

function formatHours(date: Date) {
    const hh = date.getHours();
    const mm = date.getMinutes();

    return `${hh}:${padLeft(mm.toString())}`;
}

function padLeft(s: string, n = 2, char='0') {
    return (char.repeat(n) + s).slice(-n);
}

function addHours(date, hours) {
    const d = new Date(date);
    d.setHours(d.getHours() + hours);
    return d;
}

document.addEventListener('DOMContentLoaded', () => draw());
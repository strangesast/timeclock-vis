import '../node_modules/typeface-comfortaa/index.css'
import * as faker from 'faker';
import * as d3 from 'd3';

const fakeNow = new Date(2019, 11, 20, 15, 50, 0);
const fakeData = [
    ...Array.from(Array(9)).map(_ => createFakeInfo()),
]
{
    fakeData[0].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), fakeNow.getHours(), fakeNow.getMinutes() - 3);
    fakeData[0].exit  = null;

    fakeData[1].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 15, 40);
    fakeData[1].exit  = null;
    fakeData[1].typicalExit = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 22, 0);

    fakeData[2].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 15, 30);
    fakeData[2].exit  = null;
    fakeData[2].typicalExit = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 20, 0);

    fakeData[3].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 6, 17);
    fakeData[3].exit = null;
    fakeData[3].typicalExit = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 16, 0);

    fakeData[4].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 6, 30);
    fakeData[4].exit = null;
    fakeData[4].typicalExit = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 16, 0);

    fakeData[5].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 6, 33);
    fakeData[5].exit = null;
    fakeData[5].typicalExit = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 16, 0);

    fakeData[6].enter = null;
    fakeData[6].exit = null;
    fakeData[6].typicalEnter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 16, 0);

    fakeData[7].enter = null;
    fakeData[7].exit = null;
    fakeData[7].typicalEnter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 16, 0);

    fakeData[8].enter = null;
    fakeData[8].exit = null;
    fakeData[8].typicalEnter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 16, 0);



    // shuffle(fakeData);
}

const body = d3.select(document.body);

const svg = body.select('svg');

const colors = {
    lightBlue: '#cfe2f3',
    darkBlue: '#6fa8dc',
    lightGreen: '#93c47d',
};


enum TimeBlockType {
    New = 'new',
    Active = 'active',
    Upcoming = 'upcoming',
    Unknown = 'unknown',
}

function draw() {
  const zoom = d3.zoom().scaleExtent([1, Infinity]).on('zoom', zoomed);
  const timeScale = d3.scaleTime();

  const timeAxis = d3.axisTop(timeScale)
    .tickPadding(10);

  const dataG = svg.append('g')
    .classed('data', true)

  const zoomBox = dataG.append('rect')
    .attr('pointer-events', 'all')
    .attr('fill', 'none');

  dataG.call(zoom);

  const topBar = svg.append('g').classed('top-bar', true);
  topBar.append('rect').attr('fill', colors.lightBlue);


  // current time
  topBar.append('g').classed('current-time', true).append('text')
    .attr('dominant-baseline', 'middle')
    .attr('text-anchor', 'middle');

  topBar.append('g').classed('time-scale', true);


  const padding = 8;
  const rangeWidth = 2;
  let now, width, height, innerWidth, data;

  function updateTimeScale() {
    // now = new Date();
    now = fakeNow;
    const [a, b] = [addHours(now, -rangeWidth/2), addHours(now, rangeWidth/2)];
    timeScale.domain([a, b]).range([padding, padding + innerWidth]);
  }

  function updateDimensions() {
    ({width, height} = (svg.node() as SVGElement).getBoundingClientRect());
    innerWidth = width - padding * 2;
  }

  function zoomed() {
    console.log(d3.event.x);
    console.log(timeScale.invert(d3.event.transform.x));
    //timeScale = t.rescaleX(timeScale);
    //redraw();
    // timeScale.domain(t.domain());
  }

  function redraw() {
    data = fakeData;
    updateDimensions();
    updateTimeScale();
    zoom.translateExtent([[0, 0], [width, height]])
      .extent([[0, 0], [width, height]]);

    const topBarHeight = 80;
    topBar.select('rect').attr('width', width).attr('height', topBarHeight);
    dataG.attr('transform', `translate(0,${topBarHeight + padding})`);

    zoomBox.attr('width', width)
      .attr('height', height - padding - topBarHeight);

    const currentTimeText = topBar.select('g.current-time')
      .attr('transform-origin', 'center center')
      .attr('transform', `translate(${[width/2, topBarHeight/2].toString()})`)
      .select('text')
      .attr('font-size', 30)
      .text(formatHours(now));

    let currentTimeTextWidth;
    {
      const bbox = (currentTimeText.node() as any).getBBox();
      currentTimeTextWidth = bbox.width + padding * 2;
    }

    let times;
    {
      const thisHour = floorHours(now);
      times = Array.from(Array(8)) // TODO: fix this constant '8'
        .map((_, i) => (i - 2)/2)
        .map(h => addHours(thisHour, Math.floor(h), Math.sign(h) * h % 1 * 60))
        .map(date => ({date, x: timeScale(date)}));
    }
    {
      let s = topBar.select('g.time-scale').selectAll('.time-step') as any;
      const e = s.data(times).enter().append('g').classed('time-step', true);
      e.append('text')
        .attr('dominant-baseline', 'middle')
        .attr('text-anchor', 'middle')
        .text(d => formatHours(d.date));
      s = e.merge(s).attr('transform', (d) => `translate(${d.x},${topBarHeight/2})`)

      // remove time label near current time
      s.filter(d => d.x > (width / 2 - currentTimeTextWidth / 2) &&
          d.x < (width /2 + currentTimeTextWidth / 2)
      );
    }

    {
      let s = dataG.selectAll('g.record');

      const newThreshold = 5 * 60 * 1000; // 5 minutes

      const newWidth = 240;

      const blocks = data.map(d => {
        // is new
        let type, x, blockWidth;
        if (d.enter && d.exit == null && (now - d.enter) < newThreshold) {
            type = TimeBlockType.New;
            x = width / 2 - newWidth / 2;
            blockWidth = newWidth;
        } else if (d.enter && d.exit == null) {
            type = TimeBlockType.Active;
            x = timeScale(d.enter);
            x = x > 0 ? x : 0;
            blockWidth = width / 2 - x;
        } else if (d.enter == null) {
            type = TimeBlockType.Upcoming;
            x = timeScale(d.typicalEnter);
            blockWidth = width - x;
        }
        return {...d, type, x, width: blockWidth};
      });

      const blockSpacing = 60;
      const blockPadding = 10;
      const blockHeight = blockSpacing - blockPadding;
      const blockTimeWidth = 40;

      const e = s.data(blocks).enter()
        .append('g').classed('record', true).attr('transform', `translate(0,${-blockSpacing})`);

      e.filter((d: any) => d.type == TimeBlockType.Active || d.type == TimeBlockType.Upcoming)
        .append('rect')
        .classed('background', true)
        .attr('fill', colors.lightBlue);

      e.append('rect').classed('foreground', true);

      e.append('text').classed('name', true)
        .attr('dominant-baseline', 'middle')
        .text(({name}: any) => `${name.first} ${name.last[0]}`);

      e.append('text')
        .classed('arrival time', true)
        .attr('dominant-baseline', 'middle')
        .attr('y', blockSpacing / 2)
        .text((d: any) => d.type == TimeBlockType.New ? 'Just Now' : formatHours(d.enter || d.typicalEnter));

      s = e.merge(s as any)

      s.transition()
        .delay((_, i, arr) => (arr.length - i) * 100)
        .ease(d3.easeCircleOut)
        .attr('transform', (_, i) => `translate(0,${i * blockSpacing})`)

      s.selectAll('rect').attr('height', blockHeight);

      s.select('rect.background')
        .attr('width', (d: any) => {
          const x = timeScale(d.typicalExit);
          if (d.type == TimeBlockType.Upcoming) {
            return width - x;
          }
          return x - d.x;
        })
        .attr('x', (d: any) => d.x);

      s.select('rect.foreground')
        .attr('width', (d: any) => d.width)
        .attr('x', (d: any) => d.x)
        .attr('fill', (d: any) => d.type == TimeBlockType.Active ?
          colors.darkBlue : d.type == TimeBlockType.New ?
          colors.lightGreen : colors.lightBlue);

      s.select('text.name').attr('text-anchor', (d: any) => d.type == TimeBlockType.New ? 'middle' : 'end')
        .attr('x', width / 2 - padding)
        .attr('y', blockHeight / 2 + blockPadding / 2);

      s.filter((d: any) => d.type == TimeBlockType.Upcoming).select('text.name')
        .attr('text-anchor', 'start')
        .attr('x', (d: any) => blockTimeWidth + timeScale(d.typicalEnter) + blockPadding);

      s.select('text.arrival').attr('x', (d: any) => (d.type == TimeBlockType.Upcoming ? timeScale(d.typicalEnter) : 0) + blockPadding);
    }
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

function addHours(date, hours, minutes = 0) {
    const d = new Date(date);
    d.setHours(d.getHours() + hours, d.getMinutes() + minutes);
    return d;
}

function floorHours(date: Date) {
    const d = new Date(date);
    d.setHours(d.getHours(), 0, 0, 0);
    return d;
}

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createFakeInfo() {
    const first = faker.name.firstName();
    const last = faker.name.lastName();
    return {name: {first, last}, enter: null, exit: null, typicalEnter: null, typicalExit: null};
}

document.addEventListener('DOMContentLoaded', () => draw());

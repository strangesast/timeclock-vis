import '../node_modules/typeface-comfortaa/index.css'
import * as faker from 'faker';
import * as d3 from 'd3';

const fakeNow = new Date(2019, 11, 20, 15, 45, 0);
const fakeData = [
    ...Array.from(Array(6)).map(_ => createFakeInfo()),
]
{
    fakeData[0].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), fakeNow.getHours(), fakeNow.getMinutes() - 3);
    fakeData[0].exit  = null;

    fakeData[1].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 15, 40);
    fakeData[1].exit  = null;

    fakeData[2].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 15, 30);
    fakeData[2].exit  = null;

    fakeData[3].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 6, 17);
    fakeData[3].exit = null;

    fakeData[4].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 6, 30);
    fakeData[4].exit = null;

    fakeData[5].enter = new Date(fakeNow.getFullYear(), fakeNow.getMonth(), fakeNow.getDate(), 6, 33);
    fakeData[5].exit = null;
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
    const topBar = svg.append('g').classed('top-bar', true);
    topBar.append('rect').attr('fill', colors.lightBlue);
    // current time
    topBar.append('g').classed('current-time', true).append('text')
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'middle');

    topBar.append('g').classed('time-scale', true);

    const dataG = svg.append('g').classed('data', true);

    const padding = 8;
    const timeScale = d3.scaleTime();
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

    function redraw() {
        data = fakeData;
        updateDimensions();
        updateTimeScale();

        const topBarHeight = 80;
        topBar.select('rect').attr('width', width).attr('height', topBarHeight);
        dataG.attr('transform', `translate(0,${topBarHeight + padding})`);

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
            ).each(d => console.log(d));
        }

        {
          let s = dataG.selectAll('g.record');

          const newThreshold = 5 * 60 * 1000; // 5 minutes

          const newWidth = 240;

          const blocks = data.map(d => {
              // is new
              let type, x, blockWidth;
              console.log(now - d.enter);
              console.log(now, d.enter);
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
              console.log(type);
              return {...d, type, x, width: blockWidth};
          });

          const blockSpacing = 60;
          const blockPadding = 10;

          console.log(blocks);
          const e = s.data(blocks).enter().append('g').classed('record', true);
          e.append('rect').attr('height', blockSpacing - blockPadding);

          s = e.merge(s as any)
            .attr('transform', (_, i) => `translate(0,${i * blockSpacing})`)
            .select('rect')
            .attr('width', (d: any) => d.width)
            .attr('x', (d: any) => d.x)
            .attr('fill', (d: any) => d.type == TimeBlockType.Active ? colors.darkBlue : colors.lightGreen);
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
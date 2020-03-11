import * as faker from 'faker';
import * as d3 from 'd3';

const LOCALE = (navigator.languages && navigator.languages.length) ? navigator.languages[0] : navigator.language;

enum TimeBlockType {
    New = 'new',
    Active = 'active',
    Upcoming = 'upcoming',
    Unknown = 'unknown',
}

let lastId = 0;
const fakeNow = new Date(2019, 11, 20, 15, 50, 0);
// const fakeNow = new Date(2019, 11, 20, 17, 5, 0);
const fakeData = [
    ...Array.from(Array(9)).map((_, i) => ({y: i, ...createFakeInfo()})),
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


function draw() {
  let now = new Date(fakeNow);
  let data = fakeData;

  const zoom = d3.zoom()
    // .scaleExtent([1, 3])
    .on('zoom', zoomed);
  let timeScale = d3.scaleTime()
    .domain([addHours(now, -2), addHours(now, 2)]);

  let timeAxis = d3.axisTop(timeScale)
    .tickFormat(d3.timeFormat('%H:%M'))
    .tickSize(0)
    .tickPadding(10);
  const padding = 8;
  const topBarHeight = 80;
  const rangeWidth = 2;

  const dataG = svg.append('g')
    .classed('data', true)

  const zoomBox = dataG.append('rect')
    .attr('pointer-events', 'all')
    .attr('fill', 'none');

  dataG.call(zoom);
    // .on('wheel.zoom', wheeled);

  const topBar = svg.append('g').classed('top bar', true);
  topBar.append('rect').attr('fill', colors.lightBlue);

  // current time
  topBar.append('g').classed('current-time', true)
    .append('text')
    .attr('dominant-baseline', 'middle')
    .attr('text-anchor', 'middle');

  topBar.append('g').classed('axis', true)
    .attr('transform', `translate(0,${topBarHeight})`)
    .call(timeAxis)
    .selectAll('.tick > line').remove();


  const bottomBar = svg.append('g').classed('bottom bar', true);
  bottomBar.append('rect')
    .attr('fill', colors.lightBlue)

  createButton(bottomBar, 'Add')
    .attr('transform', 'translate(10,10)')
    .on('click', () => {
      const obj = {...data[0], id: ++lastId, y: 0};
      data.unshift(obj);
      for (let i = 0; i < data.length; i++) {
        data[i].y = i;
      }
      redraw();
    });

  createButton(bottomBar, 'Reset')
    .attr('transform', 'translate(450,10)')
    .on('click', () => {
      dataG.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity,
      );
    });

  let interval;
  let startUpdates = () => {
    now.setMinutes(now.getMinutes() + 1);
    timeScale.domain([addHours(now, -2), addHours(now, 2)]);
    const obj = data[0];
    obj.type = TimeBlockType.Active;
    redraw();
    interval = setTimeout(startUpdates, 1000);
  };
  createButton(bottomBar, 'Start')
    .attr('transform', 'translate(120,10)')
    .on('click', () => {
      clearInterval(interval);
      startUpdates();
    });

  createButton(bottomBar, 'Stop')
    .attr('transform', 'translate(230,10)')
    .on('click', () => {
      clearInterval(interval);
    });

  createButton(bottomBar, 'Update')
    .attr('transform', 'translate(340,10)')
    .on('click', () => {
      let obj;
      for  (let i = data.length - 1; i > 0; i--) {
        if (data[i].type !== TimeBlockType.New) {
          obj = data[i];
          break;
        }
      }
      if (obj) {
        obj.exit = null;
        obj.enter = new Date(now);
        obj.typicalExit = addHours(now, 1);
        obj.type = TimeBlockType.New;
        redraw();
      }
    });

  let {width, height} = (svg.node() as SVGElement).getBoundingClientRect();
  let innerWidth = width - padding * 2;

  timeScale.range([padding, padding + innerWidth]);
  timeAxis.scale(timeScale);

  function wheeled() {
    const {shiftKey, deltaX, transform} = d3.event;
    console.log(deltaX);
    if (!shiftKey) {
      dataG.call(zoom.translateBy, d3.event.deltaX);
    } else {
      dataG.call(zoom, transform);
    }
  }

  const timeScaleCopy = timeScale.copy();

  function zoomed() {
    const {transform} = d3.event;
    timeScale = transform.rescaleX(timeScaleCopy);
    timeAxis = timeAxis.scale(timeScale);
    redraw(false);
  }

  function redraw(animate = true) {
    ({width, height} = (svg.node() as SVGElement).getBoundingClientRect());
    innerWidth = width - padding * 2;

    // zoom.translateExtent([[0, 0], [width, height]]).extent([[0, 0], [width, height]]);

    topBar.select('rect')
      .attr('width', width)
      .attr('height', topBarHeight);

    bottomBar.attr('transform', `translate(0,${height-topBarHeight})`)
      .select('rect')
      .attr('width', width)
      .attr('height', topBarHeight);

    dataG.attr('transform', `translate(0,${topBarHeight + padding})`);

    zoomBox.attr('width', width)
      .attr('height', height - padding - topBarHeight);

    const currentTimeText = topBar.select('g.current-time')
      .attr('transform-origin', 'center center')
      .attr('transform', `translate(${[width/2, topBarHeight/2].toString()})`)
      .select('text')
      .attr('font-size', 30)
      .text(formatDateAndHours(timeScale.invert(width / 2)));

    let currentTimeTextWidth;
    {
      const bbox = (currentTimeText.node() as any).getBBox();
      currentTimeTextWidth = bbox.width + padding * 2;
    }
    {
      let s = dataG.selectAll('g.record');

      const blockSpacing = 60;
      const blockPadding = 10;
      const blockHeight = blockSpacing - blockPadding;
      const blockTimeWidth = 40;
      const newWidth = 240;
      const newThreshold = 5 * 60 * 1000; // 5 minutes

      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        d.y = i;
        if (d.enter != null && d.exit == null && (+now - d.enter) < newThreshold) {
          d.type = TimeBlockType.New;
          d.x = width / 2 - newWidth / 2;
          d.width = newWidth;
        } else if (d.enter != null && d.exit == null) {
          d.type = TimeBlockType.Active;
          d.x = timeScale(d.enter);
          d.x = d.x > 0 ? d.x : 0;
          d.width = Math.max(timeScale(now) - d.x, 0);
        } else if (d.enter == null) {
          d.type = TimeBlockType.Upcoming;
          d.x = timeScale(d.typicalEnter);
          d.width = Math.max(width - d.x, 0);
        }
      }
      data.sort((a, b) => {
        if (a.type == TimeBlockType.New || b.type == TimeBlockType.New) return 0;
        if (a.type == TimeBlockType.Active && b.type != TimeBlockType.Active) return -1;
        if (a.type == TimeBlockType.Active && b.type == TimeBlockType.Active) {
          return a.enter < b.enter ? 1 : a.enter > b.enter ? -1 : 0;
        }
      });

      const merging = s.data(data, (d: any) => d.id);

      const e = merging.enter()
        .append('g')
        .classed('record', true)
        .attr('transform', `translate(0,${-blockSpacing})`);

      merging.exit().remove();

      e.filter((d: any) => d.type == TimeBlockType.Active || d.type == TimeBlockType.Upcoming)
        .append('rect')
        .classed('background', true)
        .attr('fill', colors.lightBlue);

      e.append('rect').classed('foreground', true)
        .attr('width', d => d.width)
        .attr('x', d => d.x);

      e.append('text').classed('name', true)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text(({name}: any) =>
          `${name.first} ${name.last[0]}`);

      e.filter((d: any) => d.type == TimeBlockType.New).select('text.name').attr('x', width / 2).attr('y', blockSpacing / 2);

      e.append('text')
        .classed('arrival time', true)
        .attr('dominant-baseline', 'middle')
        .attr('x', blockPadding)
        .attr('y', blockSpacing / 2)

      let updateOld = s;

      s = e.merge(s as any);

      let updateNew = s;

      const t = d3.transition();

      s.selectAll('rect').attr('height', blockHeight);

      {
        let ss = s.select('rect.background')
        if (animate) {
          ss = ss.transition(t) as any;
        }
        ss.attr('width', (d: any) => {
            const x = timeScale(d.typicalExit);
            let w;
            switch (d.type) {
              case TimeBlockType.New:
                w = 0;
                break;
              case TimeBlockType.Upcoming:
                w = width - x;
                break;
              default:
                w = x - d.x;
            }
            w = Math.max(w, 0);
            return w;
          })
          .attr('x', (d: any) => d.x);
      }
      {
        let ss = s.select('rect.foreground')
        if (animate) {
          ss = ss.transition(t) as any;
        }
        ss.attr('width', (d: any) => d.width)
          .attr('x', (d: any) => d.x)
          .attr('fill', (d: any) => {
            return d.type == TimeBlockType.Active ? colors.darkBlue :
              d.type == TimeBlockType.New ? colors.lightGreen :
              colors.lightBlue;
          });
      }

      {
        let ss = s.select('text.name');
        ss.attr('text-anchor', 'end');
        ss.filter((d: any) => d.type == TimeBlockType.New).select('text.name').attr('x', width / 2);

        if (animate) {
          ss = ss.transition(t) as any;
        }

        ss.attr('x', width / 2 - blockPadding)
          .attr('y', blockSpacing / 2);
        ss.filter((d: any) => d.type == TimeBlockType.New)
          .attr('text-anchor', 'middle')
          .attr('x', width / 2);
      }

      {
        let ss = s.filter((d: any) => d.type == TimeBlockType.Upcoming)
          .select('text.name')
          .attr('text-anchor', 'start')

        if (animate) {
          ss = ss.transition(t) as any;
        }

        ss.attr('x', (d: any) => blockTimeWidth + Math.max(timeScale(d.typicalEnter), 0) + blockPadding);
      }
      {
        let ss = s.select('text.arrival')
          .text((d: any) => d.type == TimeBlockType.New ? 'Just Now' : formatHours(d.enter || d.typicalEnter));

        if (animate) {
          ss = ss.transition(t) as any;
        }

        ss.attr('x', (d: any) => Math.max(d.type == TimeBlockType.Upcoming ? timeScale(d.typicalEnter) : 0, 0) + blockPadding);
      }
      {
        let ss = topBar.select('g.axis');

        if (animate) {
          ss = ss.transition(t) as any;
        }

        ss.call(timeAxis);
      }

      if (animate) {
        updateOld = updateOld.transition(t)
          .ease(d3.easeCircleOut) as any;

        updateNew = updateNew.transition(t)
          .ease(d3.easeCircleOut) as any;
      }

      updateOld.attr('transform', (d: any) => `translate(0,${d.y * blockSpacing})`)
      updateNew.attr('transform', (d: any) => `translate(0,${d.y * blockSpacing})`)
    }
  }

  redraw(false);

  // automatically move time
  //startUpdates();

  // reload every 5 minutes
  //setInterval(() => window.location.reload(true), 2 * 60 * 1000);

  const debounceRedraw = debounce(redraw);

  window.addEventListener('resize', () => {
      debounceRedraw();
  });
};

function debounce(fn: () => any, time = 100) {
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

function formatDateAndHours(date: Date): string {
  const a = date.toLocaleDateString(LOCALE, { weekday: 'short' });
  const d = date.getDate();
  const Y = date.getFullYear();
  const hhmm = formatHours(date);
  return `${a} ${d}/${Y} ${hhmm}`;
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

function createButton(sel, text) {
  const g = sel.append('g');
  const width = 100;
  const height = 40;
  g.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', colors.lightGreen);
  g.append('text')
    .attr('x', width / 2)
    .attr('y', height / 2)
    .attr('dominant-baseline', 'middle')
    .attr('text-anchor', 'middle')
    .text(text);
  return g;
}


function createFakeInfo() {
  const id = ++lastId;
  const first = faker.name.firstName();
  const last = faker.name.lastName();
  return {
    id,
    name: {first, last},
    enter: null,
    exit: null,
    typicalEnter: null,
    typicalExit: null,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    type: TimeBlockType.Unknown,
  };
}

document.addEventListener('DOMContentLoaded', () => draw());

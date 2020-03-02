import { Component, ElementRef, OnDestroy, AfterViewInit, HostListener, ViewChild } from '@angular/core';
import { ScrollDispatcher } from '@angular/cdk/scrolling';
import { merge, fromEvent, Subject, BehaviorSubject } from 'rxjs';
import { auditTime, startWith, withLatestFrom, map, takeUntil, tap, throttleTime } from 'rxjs/operators';
import { TimeclockVisService } from './timeclock-vis.service';
import * as d3 from 'd3';

const SCROLL_ARGS = {left: 0, top: 0, behavior: 'auto' as ScrollBehavior};

@Component({
  selector: 'lib-timeclock-vis',
  template: `<div (scroll)="scrolled($event)"><svg #svg></svg></div>`,
  styles: [`
  :host {
    display: block;
    height: 100%;
  }
  :host > div {
    height: 100%;
    overflow: auto;
  }
  `]
})
export class TimeclockVisComponent implements AfterViewInit, OnDestroy {
  destroyed$ = new Subject();
  resolution = new BehaviorSubject(30 / 3600000); // 30 pixels per hour
  scrolled$ = new Subject();

  private lastScrollArgs = SCROLL_ARGS;

  @ViewChild('svg') svg: ElementRef;

  @HostListener('beforeunload')
  beforeUnload() {
    this.svg.nativeElement.parentElement.scrollTo(this.lastScrollArgs);
  }

  @HostListener('scroll')
  scrolled() {
    this.scrolled$.next();
  }

  dimensions() {
    return this.svg.nativeElement.parentElement.getBoundingClientRect();
  }

  constructor(
    private scroller: ScrollDispatcher,
    public service: TimeclockVisService) {
  }

  ngAfterViewInit() {
    const svg = d3.select(this.svg.nativeElement);

    const now = new Date();

    const date = now;
    // 30 / 1h
    // domain = width / resolution

    const xScale = d3.scaleTime();
    // const scrolled$ = this.scroller.scrolled();

    const resize$ = fromEvent(window, 'resize').pipe(
      startWith(null),
      map(() => this.dimensions().width),
      auditTime(1000),
      withLatestFrom(this.resolution),
      tap(([width, resolution]) => {
        const domainWidth = width / resolution;
        const totalWidth = width * 10;
        const x0 = totalWidth - width;
        const x1 = totalWidth;
        const d0 = new Date(+date - domainWidth / 2);
        const d1 = new Date(+date + domainWidth / 2);
        const initialDomain = [d0, d1];

        d3.select(this.svg.nativeElement).attr('width', totalWidth);

        xScale.range([x0, x1]).domain(initialDomain);
        this.svg.nativeElement.parentElement.scrollTo(this.lastScrollArgs = {...SCROLL_ARGS, left: x0});
      }),
    );
    merge(resize$, this.scrolled$.pipe(tap(() => console.log('scrolled')))).pipe(
      map(() => this.dimensions()),
      // withLatestFrom(this.resolution),
      map(({x, width: w}) => [xScale.invert(x), xScale.invert(x + w)]),
      tap((args) => console.log(args)),
      // switchMap(domain => worker.getShiftsInRange(domain)),
      // map((data: any) => {
      //   const dim = [totalWidth, contentHeight];
      //   data.shifts.forEach(updatePositions);
      //   render(template(data, dim), document.body);
      // }),
    ).subscribe();

    // const {width, height} = this.dimensions();
    // const d = width / resolution;
    // const d0 = d3.timeSecond.offset(date, -d / 2);
    // const d1 = d3.timeSecond.offset(date, +d / 2);

    // service.getShiftsInRange([d0, d1]).then(data => {
    //   console.log(data);
    // });
    //
    // get range of visible time
    // fetch
    // draw

    this.scrolled$.pipe(
      // throttleTime(100),
      // map(([x0, w]) => [xScale.invert(x0), xScale.invert(x0 + w)]),
      // switchMap(domain => worker.getShiftsInRange(domain)),
      // map((data: any) => {
      //   const dim = [totalWidth, contentHeight];
      //   data.shifts.forEach(updatePositions);
      //   render(template(data, dim), document.body);
      // }),
      takeUntil(this.destroyed$),
      map(v => console.log('scrollx', this.svg.nativeElement.parentElement.scrollX))
    );
  }

  ngOnDestroy() {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}

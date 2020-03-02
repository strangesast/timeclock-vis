import { Component, OnDestroy, AfterViewInit, HostListener, ViewChild } from '@angular/core';
import { ScrollDispatcher } from '@angular/cdk/scrolling';
import { Subject, BehaviorSubject } from 'rxjs';
import { map, takeUntil, tap, throttleTime } from 'rxjs/operators';
import * as d3 from 'd3';

@Component({
  selector: 'lib-timeclock-vis',
  template: `<svg #svg></svg>`,
  styles: [`
  :host {
    display: block;
    height: 100%;
  }
  `]
})
export class TimeclockVisComponent implements AfterViewInit, OnDestroy {
  destroyed$ = new Subject();
  resolution = new BehaviorSubject(30 / 3600000); // 30 pixels per hour

  @ViewChild('svg') svg;

  // @HostListener('scroll')
  // scrolled($event) {
  //   console.log($event);
  // }

  constructor(private scroller: ScrollDispatcher) {
    scroller.scrolled().pipe(
      tap($event => console.log($event)),
      // throttleTime(100),
      // map(([x0, w]) => [xScale.invert(x0), xScale.invert(x0 + w)]),
      // switchMap(domain => worker.getShiftsInRange(domain)),
      // map((data: any) => {
      //   const dim = [totalWidth, contentHeight];
      //   data.shifts.forEach(updatePositions);
      //   render(template(data, dim), document.body);
      // }),
      takeUntil(this.destroyed$),
    ).subscribe();
  }

  ngAfterViewInit(): void {
    const svg = d3.select(this.svg.nativeElement);
    svg.attr('width', '100%').attr('height', '100%');
  }

  ngOnDestroy() {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}

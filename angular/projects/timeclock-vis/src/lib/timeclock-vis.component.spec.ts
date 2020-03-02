import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TimeclockVisComponent } from './timeclock-vis.component';

describe('TimeclockVisComponent', () => {
  let component: TimeclockVisComponent;
  let fixture: ComponentFixture<TimeclockVisComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TimeclockVisComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TimeclockVisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

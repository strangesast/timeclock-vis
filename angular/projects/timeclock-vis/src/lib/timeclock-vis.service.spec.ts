import { TestBed } from '@angular/core/testing';

import { TimeclockVisService } from './timeclock-vis.service';

describe('TimeclockVisService', () => {
  let service: TimeclockVisService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TimeclockVisService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

import { TestBed } from '@angular/core/testing';

import { MockingDataProviderService } from './mocking-data-provider.service';

describe('MockingDataProviderService', () => {
  let service: MockingDataProviderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MockingDataProviderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

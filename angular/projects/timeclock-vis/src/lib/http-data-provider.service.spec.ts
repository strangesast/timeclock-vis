import { TestBed } from '@angular/core/testing';

import { HttpDataProviderService } from './http-data-provider.service';

describe('HttpDataProviderService', () => {
  let service: HttpDataProviderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HttpDataProviderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

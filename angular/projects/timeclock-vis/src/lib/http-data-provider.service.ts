import { Injectable } from '@angular/core';
import { DataProviderService } from './models/data-provider';

@Injectable({
  providedIn: 'root'
})
export class HttpDataProviderService extends DataProviderService {
  getShiftsInRange([minDate, maxDate]: [Date, Date]) {
    return Promise.reject();
  }

  getShiftsByEmployeeInRange(employeeId: string, [minDate, maxDate]: [Date, Date]) {
    return Promise.reject();
  }

  constructor() {
    super();
  }
}

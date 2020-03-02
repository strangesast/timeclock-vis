import { Injectable } from '@angular/core';
import { DataResponse, DataProviderService } from './data-provider';

@Injectable({
  providedIn: 'root'
})
export class TimeclockVisService {

  getShiftsInRange(range: [Date, Date]) {
    return this.dataProvider.getShiftsInRange(range);
  }

  getShiftsByEmployeeInRange(employeeId: string, range: [Date, Date]) {
    return this.dataProvider.getShiftsByEmployeeInRange(employeeId, range);
  }

  constructor(private dataProvider: DataProviderService) { }
}

import { Injectable } from '@angular/core';
import { DataProviderService } from './models/data-provider';
import { Shift } from './models/shift';
import { generateData } from './mocking';
import { inFieldOfView } from './util';

@Injectable({
  providedIn: 'root'
})
export class MockingDataProviderService extends DataProviderService {
  private data = generateData(new Date());

  async getShiftsInRange(range: [Date, Date]) {
    const [minDate, maxDate] = range;
    const { shifts, employees } = await this.data;
    const filteredShifts: Shift[] = [];
    const filteredEmployees = {};
    const employeeIds = [];
    for (const shift of shifts) {
      if (inFieldOfView([shift.start, shift.end], [minDate, maxDate])) {
        const employeeId = shift.employee;
        if (!employeeIds.includes(employeeId)) {
          filteredEmployees[employeeId] = employees[employeeId];
          employeeIds.push(employeeId);
        }
        filteredShifts.push(shift);
      }
    }
    return { shifts: filteredShifts, employees: filteredEmployees, employeeIds, range };
  }

  async getShiftsByEmployeeInRange(employeeId: string, range: [Date, Date]) {
    const [minDate, maxDate] = range;
    const { shifts, employees } = await this.data;
    const employee = employees[employeeId];
    const filteredShifts: Shift[] = [];
    for (const shift of shifts) {
      if (shift.employee === employeeId && inFieldOfView([shift.start, shift.end], [minDate, maxDate])) {
        filteredShifts.push(shift);
      }
    }
    return { range, shifts: filteredShifts, employees: {[employeeId]: employee}, employeeIds: [employeeId] };
  }

  constructor() {
    super();
  }
}

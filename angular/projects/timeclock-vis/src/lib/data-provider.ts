import { MongoObject } from './mongo';
import { Employee, EmployeeID } from './employee';
import { Shift } from './shift';

type DateRange = [Date, Date];

export interface DataResponse {
  range: [Date, Date];
  shifts: Shift[];
  employees: {[key: string]: Employee};
  employeeIds: EmployeeID[];
}

export interface DataProvider {
  getShiftsInRange: (range: DateRange) => Promise<DataResponse>;
  getShiftsByEmployeeInRange: (id: EmployeeID, range: DateRange) => Promise<DataResponse>;
}

export abstract class DataProviderService implements DataProvider {
  public abstract getShiftsInRange(range: DateRange): Promise<DataResponse>;
  public abstract getShiftsByEmployeeInRange(id: EmployeeID, range: DateRange): Promise<DataResponse>;
}

interface MongoObject {
  _id: string;
}

export enum EmployeeShiftColor {
  BLUE,
  GREEN,
  RED,
  ORANGE,
  PINK,
}

export const EMPLOYEE_SHIFT_COLORS = Object.values(EmployeeShiftColor).filter(v => typeof v === 'string');

export type EmployeeID = string;

export interface Employee extends MongoObject {
  id: EmployeeID;
  Code: string;
  Name: string;
  MiddleName: string;
  LastName: string;
  HireDate: Date;
  shift?: {
    start: Date;
    end: Date;
    duration: number;
  };
  Color: EmployeeShiftColor;
}

export enum ShiftState {
  Complete = 'complete',
  Incomplete = 'incomplete',
}

export enum ShiftComponentType {
  Actual = 'actual',
  Projected = 'projected',
}

interface BaseShiftComponent extends MongoObject {
  id?: string;
  x: number;
  w: number;
  fill: d3.Color;
  start: Date;
  end: Date;
  startNorm?: Date;
  endNorm?: Date;
  duration: number;
  employeeId: EmployeeID; // needed for fill (gay)
}

interface ProjectedShiftComponent extends BaseShiftComponent {
  type: ShiftComponentType.Projected;
}

interface ActualShiftComponent extends BaseShiftComponent {
  type: ShiftComponentType.Actual;
  state: ShiftState;
}

export type ShiftComponent = ProjectedShiftComponent|ActualShiftComponent;

export interface Shift extends MongoObject {
  id: string;
  row: number;
  employee: EmployeeID;
  start: Date; // start of first component (actual or projected)
  startNorm?: Date; // start of first component (actual or projected)
  end: Date; // end of last component (actual or projected)
  duration: number; // total so far
  expectedDuration: number;
  components: ShiftComponent[];
  punches: {
    date: Date
  }[],
  state: ShiftState;
  started: boolean;
  y: number;
  x: number;
}

export type TranslateExtent = [[number, number], [number, number]];

export type DateRange = [Date, Date];

interface SigBase {
  type: string;
  getShiftsInRange: (range: DateRange) => Promise<ShiftsResponse>;
  getShiftsByEmployeeInRange: (employeeId: EmployeeID, range: DateRange) => Promise<ShiftsResponse>;
  getGraphData: (range?: DateRange) => Promise<GraphDataResponse>;
}

interface Map<T> {
  [id: string]: T;
}

export interface ShiftsResponse {
  range: [Date, Date];
  shifts: Shift[];
  employees: Map<Employee>;
  employeeIds: EmployeeID[];
}

interface SigMocking extends SigBase {
  type: 'mocking';
  now: Date;
  data: {shifts: Shift[], employees: {[id: string]: Employee}};
  initializeData: (date: Date) => Promise<void>;
}

interface SigFetch extends SigBase {
  type: 'fetch';
}

export type Sig = SigMocking | SigFetch;

export interface GraphDataResponse {
  employees: Employee[];
  data: {
    _id: string;
    buckets: {[employeeId: string]: number};
    total: number;
  }[];
  columns: string[];
}

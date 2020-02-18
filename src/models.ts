export enum EmployeeShiftColor {
  BLUE,
  GREEN,
  RED,
  ORANGE,
  PINK,
}

export const EMPLOYEE_SHIFT_COLORS = Object.values(EmployeeShiftColor).filter(v => typeof v === 'string');

export type EmployeeID = string;

export interface Employee {
  id: EmployeeID;
  name: string;
  shift: {
    start: Date;
    end: Date;
    duration: number;
  };
  color: EmployeeShiftColor;
}

export enum ShiftState {
  Complete = 'complete',
  Incomplete = 'incomplete',
}

export enum ShiftComponentType {
  Actual = 'actual',
  Projected = 'projected',
}

interface BaseShiftComponent {
  x: number;
  w: number;
  fill: d3.Color;
  start: Date;
  end: Date;
  duration: number;
  showTime: boolean;
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

export interface Shift {
  id: string;
  employee: {
    id: EmployeeID;
    name: string;
  }
  start: Date; // start of first component (actual or projected)
  end: Date; // end of last component (actual or projected)
  duration: number; // total so far
  expectedDuration: number;
  components: ShiftComponent[];
  punches: {
    date: Date
  }[],
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
}

interface Map<T> {
  [id: string]: T;
}

export interface ShiftsResponse {
  shifts: Shift[];
  employees: Map<Employee>;
  employeeIds: EmployeeID[];
}

interface SigMocking extends SigBase {
  type: 'mocking';
  data: any;
  initializeData: (date: Date) => Promise<void>;
}

interface SigFetch extends SigBase {
  type: 'fetch';
}

export type Sig = SigMocking | SigFetch;

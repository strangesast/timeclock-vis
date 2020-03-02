import { MongoObject } from './mongo';
import { EmployeeID } from './employee';


export interface Shift extends MongoObject {
  id: string;
  row: number;
  employee: EmployeeID;
  start: Date; // start of first component (actual or projected)
  end: Date; // end of last component (actual or projected)
  duration: number; // total so far
  expectedDuration: number;
  components: any[];
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
  start: Date;
  end: Date;
  duration: number;
}

interface ProjectedShiftComponent extends BaseShiftComponent {
  type: ShiftComponentType.Projected;
}

interface ActualShiftComponent extends BaseShiftComponent {
  type: ShiftComponentType.Actual;
  state: ShiftState;
}

export type ShiftComponent = ProjectedShiftComponent | ActualShiftComponent;

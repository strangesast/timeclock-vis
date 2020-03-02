import { MongoObject } from './mongo';

export type EmployeeID = string;

export enum EmployeeShiftColor {
  BLUE,
  GREEN,
  RED,
  ORANGE,
  PINK,
}

export interface Employee extends MongoObject {
  id: EmployeeID;
  Code: string;
  Name: string;
  MiddleName: string;
  LastName: string;
  HireDate: Date;
  shift: {
    start: Date;
    end: Date;
    duration: number;
  };
  color: EmployeeShiftColor;
}

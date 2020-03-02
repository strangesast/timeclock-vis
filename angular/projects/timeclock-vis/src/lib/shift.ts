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

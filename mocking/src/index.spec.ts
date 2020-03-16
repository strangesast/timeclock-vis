import { assert, expect, use } from 'chai';
import 'mocha';

import { generateData } from './index';

describe('index', () => {
  it ('should do this', () => {
    const date = new Date(2000, 0, 1, 2, 22);
    const data = generateData(date)
    expect(data).to.be.a('object');
    expect(data).to.have.property('shifts');
    expect(data.shifts).to.be.a('array');
    expect(data.shifts).to.have.lengthOf.above(10);
    expect(data).to.have.property('employees');
    expect(data.employees).to.be.a('object');
    expect(Object.keys(data.employees)).to.have.lengthOf(10);
  });
});

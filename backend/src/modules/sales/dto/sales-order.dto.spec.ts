import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { SalesOrderItemDto } from './sales-order.dto';

describe('SalesOrderItemDto unitPrice transform', () => {
  const build = (unitPrice: unknown) =>
    plainToInstance(SalesOrderItemDto, { productId: 'p', quantity: 1, unitPrice });

  it('keeps an explicit zero', () => {
    expect(build(0).unitPrice).toBe(0);
    expect(build('0').unitPrice).toBe(0);
  });

  it('parses a positive value', () => {
    expect(build('25.5').unitPrice).toBe(25.5);
  });

  it('maps empty / null / undefined to undefined', () => {
    expect(build('').unitPrice).toBeUndefined();
    expect(build(null).unitPrice).toBeUndefined();
    expect(build(undefined).unitPrice).toBeUndefined();
  });
});

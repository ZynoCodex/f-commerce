import { describe, expect, it } from 'vitest';
import { EDITABLE_ORDER_STATUSES, ORDER_TRANSITIONS, OrderStatus } from './order.entity.js';

describe('order status rules', () => {
  // covers AC-10: the transition table is the full workflow contract
  it('allows exactly the documented moves from every status', () => {
    expect(ORDER_TRANSITIONS).toEqual({
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED', 'RETURNED'],
      DELIVERED: ['RETURNED'],
      CANCELLED: [],
      RETURNED: [],
    });
  });

  // covers AC-9: only pending and confirmed orders can be edited
  it('allows edits only while the order is pending or confirmed', () => {
    expect(EDITABLE_ORDER_STATUSES).toEqual([OrderStatus.PENDING, OrderStatus.CONFIRMED]);
  });

  // covers AC-10: the table answers for every value of the status enum
  it('has a transition row for every status', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ORDER_TRANSITIONS[status]).toBeDefined();
    }
    expect(Object.values(OrderStatus)).toHaveLength(7);
  });
});

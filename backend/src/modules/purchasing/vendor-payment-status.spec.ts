import { ConflictException } from '@nestjs/common';
import { PostingType } from '../../common/accounting-posting/enums';
import { expectedVendorPaymentPostingType } from './vendor-payment-status';

function conflictMessage(error: unknown): { text: string; reason: string } {
  const response = (error as ConflictException).getResponse() as {
    message: { text: string; reason: string };
  };
  return response.message;
}

describe('expectedVendorPaymentPostingType', () => {
  it('expects PURCHASE_PAYMENT for a positive amount', () => {
    expect(expectedVendorPaymentPostingType('100.0000')).toBe(
      PostingType.PURCHASE_PAYMENT,
    );
    expect(expectedVendorPaymentPostingType('0.0001')).toBe(
      PostingType.PURCHASE_PAYMENT,
    );
  });

  it('expects PURCHASE_REFUND for a negative amount', () => {
    expect(expectedVendorPaymentPostingType('-100.0000')).toBe(
      PostingType.PURCHASE_REFUND,
    );
    expect(expectedVendorPaymentPostingType('-0.0001')).toBe(
      PostingType.PURCHASE_REFUND,
    );
  });

  it('throws ConflictException with reason zero_amount on zero', () => {
    let caught: unknown;
    try {
      expectedVendorPaymentPostingType('0.0000');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect(conflictMessage(caught).reason).toBe('zero_amount');
    expect(conflictMessage(caught).text).toEqual(expect.any(String));
  });
});

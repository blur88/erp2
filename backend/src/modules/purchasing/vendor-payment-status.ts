import { ConflictException } from '@nestjs/common';
import { PostingType } from '../../common/accounting-posting/enums';
import { toMinorUnits } from '../../common/utils/money';

/**
 * The posting type a vendor payment's original journal entry must carry,
 * derived from the sign of its amount (#1401).
 *
 * A positive amount is money paid out to the supplier -> PURCHASE_PAYMENT;
 * a negative amount is money received back -> PURCHASE_REFUND. A zero amount
 * can belong to neither, so the void lookup rejects it before it becomes an
 * ambiguous search: there is no entry a zero payment could have posted.
 */
export function expectedVendorPaymentPostingType(amount: string): PostingType {
  const minor = toMinorUnits(amount);
  if (minor > 0n) return PostingType.PURCHASE_PAYMENT;
  if (minor < 0n) return PostingType.PURCHASE_REFUND;
  throw new ConflictException({
    message: {
      text: `Vendor payment amount must be non-zero to have an expected posting type (got ${amount})`,
      reason: 'zero_amount',
    },
  });
}

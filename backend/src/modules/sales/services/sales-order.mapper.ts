import { DiscountType } from '../../../database/entities/sales-order-item.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { CustomerPrintDto } from '../dto/customer.dto';
import { SalesOrderResponseDto } from '../dto/sales-order.dto';
import { formatScale4, toMinorUnits } from '../../../common/utils/money';

export function mapSalesOrderToResponseDto(
  order: SalesOrder,
  payments: SalesOrderPayment[] = [],
): SalesOrderResponseDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    fulfilledAt: order.fulfilledAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    subtotal: Number(order.subtotal || 0),
    shippingAmount: Number(order.shippingAmount || 0),
    totalAmount: order.totalAmount,
    paidAmount: order.paidAmount || '0.0000',
    balanceDue:
      order.balanceDue ??
      formatScale4(toMinorUnits(order.totalAmount) - toMinorUnits(order.paidAmount || '0.0000')),
    notes: order.notes,
    customerId: order.customerId,
    customer: order.customer
      ? ({
          id: order.customer.id,
          name: order.customer.name,
          phone: order.customer.phone,
          streetAddress: order.customer.billingStreetAddress,
          city: order.customer.billingCity,
          state: order.customer.billingState,
          postalCode: order.customer.billingPostalCode,
          country: order.customer.billingCountry,
        } satisfies CustomerPrintDto)
      : undefined,
    items:
      order.items?.map((item) => ({
        id: item.id,
        productId: item.productId,
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              description: item.product.description,
              barcode: item.product.barcode,
              // Preserve "not loaded" as undefined rather than defaulting to 0.
              // A trimmed list query may omit stockQuantity; coercing it to 0
              // makes the frontend falsely report "out of stock" (SO-26-024).
              stockQuantity:
                item.product.stockQuantity == null
                  ? undefined
                  : Number(item.product.stockQuantity),
            }
          : null,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discountType: item.discountType || DiscountType.PERCENTAGE,
        discountPercent: Number(item.discountPercent || 0),
        discountAmount: Number(item.discountAmount || 0),
        totalAmount: Number(item.totalAmount),
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })) || [],
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      paymentDate: p.paymentDate,
      referenceNumber: p.referenceNumber,
      notes: p.notes,
      paymentMethodId: p.paymentMethodId,
      paymentMethodName: (p.paymentMethod as any)?.name,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

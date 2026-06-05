import { DiscountType } from '../../../database/entities/sales-order-item.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { CustomerPrintDto } from '../dto/customer.dto';
import { SalesOrderResponseDto } from '../dto/sales-order.dto';

export function mapSalesOrderToResponseDto(
  order: SalesOrder,
  payments: SalesOrderPayment[] = [],
): SalesOrderResponseDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    status: order.status,
    paymentStatus: order.paymentStatus,
    subtotal: Number(order.subtotal || 0),
    shippingAmount: Number(order.shippingAmount || 0),
    totalAmount: Number(order.totalAmount),
    paidAmount: Number(order.paidAmount || 0),
    balanceDue: Number(
      order.balanceDue ?? Number(order.totalAmount) - Number(order.paidAmount || 0),
    ),
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
              stockQuantity: Number(item.product.stockQuantity ?? 0),
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
      amount: Number(p.amount),
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

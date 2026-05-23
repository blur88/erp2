import { DiscountType } from '../../../database/entities/sales-order-item.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { CustomerPrintDto } from '../dto/customer.dto';
import { SalesOrderResponseDto } from '../dto/sales-order.dto';

export function mapSalesOrderToResponseDto(
  order: SalesOrder,
  directPayments?: any[],
): SalesOrderResponseDto {
  const invoicePayments = (order.invoices ?? []).flatMap(
    (invoice) =>
      (invoice.payments ?? []).map((payment) => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
      })),
  );

  const mappedDirectPayments = (directPayments ?? []).map((payment) => ({
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    amount: Number(payment.amount),
    paymentDate: payment.paymentDate,
  }));

  const payments = [...invoicePayments, ...mappedDirectPayments].filter(
    (payment, index, allPayments) =>
      allPayments.findIndex((candidate) => candidate.id === payment.id) === index,
  );

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    fulfilledDate: order.fulfilledDate,
    shippingAmount: Number(order.shippingAmount || 0),
    totalAmount: Number(order.totalAmount),
    paidAmount: Number(order.paidAmount),
    isFulfilled: order.isFulfilled,
    isPaidInFull: order.isPaidInFull,
    balanceDue: order.balanceDue,
    canFulfill: order.canFulfill,
    canUnfulfill: order.canUnfulfill,
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
    invoices:
      order.invoices?.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        shippingAmount: Number(invoice.shippingAmount || 0),
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount),
        balanceDue: Number(invoice.balanceDue),
        customerName: invoice.customer?.name,
        customerId: invoice.customerId,
        salesOrderId: invoice.salesOrderId,
        salesOrder: {
          id: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
        },
        orderNumber: order.orderNumber,
        payments:
          invoice.payments?.map((payment) => ({
            id: payment.id,
            paymentNumber: payment.paymentNumber,
            paymentDate: payment.paymentDate,
            amount: Number(payment.amount),
            paymentMethodId: payment.paymentMethodId,
            paymentMethod: payment.paymentMethodEntity?.code?.toLowerCase() || 'cash',
            status: payment.status,
          })) || [],
        items:
          invoice.items?.map((item) => ({
            id: item.id,
            lineNumber: item.lineNumber,
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discountType: item.discountType,
            discountPercent: Number(item.discountPercent || 0),
            discount: Number(item.discount),
            totalAmount: Number(item.totalAmount),
            product: item.product
              ? {
                  id: item.product.id,
                  name: item.product.name,
                  barcode: item.product.barcode,
                }
              : undefined,
          })) || [],
      })) || [],
    payments,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    deletedAt: order.deletedAt,
  };
}

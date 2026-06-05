import { PaymentController } from "./payment.controller";
import { PaymentService } from "../services/payment.service";

describe("PaymentController", () => {
  let controller: PaymentController;
  let paymentService: Pick<PaymentService, "getPaymentStatistics">;

  beforeEach(() => {
    paymentService = {
      getPaymentStatistics: jest.fn().mockResolvedValue({ totalPayments: 0 }),
    } as any;

    controller = new PaymentController(paymentService as PaymentService);
  });

  it("passes validated statistics query values to getPaymentStatistics", async () => {
    await controller.getPaymentStatistics({
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });

    expect(paymentService.getPaymentStatistics).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      new Date("2026-01-01"),
      new Date("2026-01-31"),
    );
  });
});

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateVendorPaymentDto } from "./vendor-payment.dto";

const validateAmount = async (amount: any) => {
  const dto = plainToInstance(CreateVendorPaymentDto, {
    supplierId: "3f1e4b9a-0000-4000-8000-000000000001",
    paymentDate: "2026-08-04",
    amount,
  });
  return (await validate(dto)).filter((e) => e.property === "amount");
};

describe("vendor payment DTO amount", () => {
  it("accepts a canonical scale-4 string", async () => {
    expect(await validateAmount("1000.0000")).toHaveLength(0);
  });

  // This DTO's floor is 0 (@Min(0) today), unlike the 0.01 floor elsewhere.
  it("accepts zero, preserving the existing @Min(0) floor", async () => {
    expect(await validateAmount("0")).toHaveLength(0);
    expect(await validateAmount("0.0000")).toHaveLength(0);
  });

  it("accepts a sub-cent value, which the zero floor permits", async () => {
    expect(await validateAmount("0.0001")).toHaveLength(0);
  });

  it("preserves a large decimal(12,4) value", async () => {
    expect(await validateAmount("99999999.9900")).toHaveLength(0);
  });

  it("rejects exponential notation", async () => {
    expect(await validateAmount("1e3")).not.toHaveLength(0);
  });

  it("rejects more than 4 fractional digits", async () => {
    expect(await validateAmount("1.00001")).not.toHaveLength(0);
  });

  it("rejects non-numeric text", async () => {
    expect(await validateAmount("abc")).not.toHaveLength(0);
  });

  it("rejects a negative amount", async () => {
    expect(await validateAmount("-1.0000")).not.toHaveLength(0);
  });
});

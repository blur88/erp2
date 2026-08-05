import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreatePaymentDto } from "./payment.dto";

const validateAmount = async (amount: any) => {
  const dto = plainToInstance(CreatePaymentDto, {
    customerId: "3f1e4b9a-0000-4000-8000-000000000001",
    paymentMethodId: "3f1e4b9a-0000-4000-8000-000000000002",
    paymentDate: "2026-08-04",
    amount,
  });
  return (await validate(dto)).filter((e) => e.property === "amount");
};

describe("CreatePaymentDto amount", () => {
  it("accepts a canonical scale-4 string", async () => {
    expect(await validateAmount("1000.0000")).toHaveLength(0);
  });

  it("accepts a value exactly at the 0.01 floor", async () => {
    expect(await validateAmount("0.01")).toHaveLength(0);
  });

  it("keeps the string form intact (no numeric transform)", async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      amount: "1000.0001",
    } as any);
    expect(dto.amount).toBe("1000.0001");
  });

  // 11 integer digits is the maximum decimal(15,4) holds. Validation is lexical,
  // so the value passes through with every digit intact — no binary64 rounding.
  it("accepts and preserves the maximum decimal(15,4) magnitude", async () => {
    expect(await validateAmount("99999999999.9900")).toHaveLength(0);

    const dto = plainToInstance(CreatePaymentDto, {
      amount: "99999999999.9999",
    } as any);
    expect(dto.amount).toBe("99999999999.9999");
  });

  it("rejects zero", async () => {
    expect(await validateAmount("0")).not.toHaveLength(0);
  });

  it("rejects 0.0001 and 0.0099, below the preserved 0.01 floor", async () => {
    expect(await validateAmount("0.0001")).not.toHaveLength(0);
    expect(await validateAmount("0.0099")).not.toHaveLength(0);
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
    expect(await validateAmount("-5.0000")).not.toHaveLength(0);
  });
});

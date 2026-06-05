import { validate } from "class-validator";
import {
  AsOfDateQueryDto,
  DateRangeQueryDto,
  PaymentStatisticsQueryDto,
} from "./report-date-query.dto";

describe("report date query DTOs", () => {
  it("rejects array-valued asOfDate", async () => {
    const dto = Object.assign(new AsOfDateQueryDto(), {
      asOfDate: ["2026-01-01", "2026-01-02"],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === "asOfDate")).toBe(true);
  });

  it("rejects invalid asOfDate strings", async () => {
    const dto = Object.assign(new AsOfDateQueryDto(), {
      asOfDate: "not-a-date",
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === "asOfDate")).toBe(true);
  });

  it("accepts valid optional asOfDate", async () => {
    const dto = Object.assign(new AsOfDateQueryDto(), {
      asOfDate: "2026-01-01",
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects array-valued fromDate and toDate", async () => {
    const dto = Object.assign(new DateRangeQueryDto(), {
      fromDate: ["2026-01-01", "2026-01-02"],
      toDate: ["2026-01-03", "2026-01-04"],
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(["fromDate", "toDate"]));
  });

  it("accepts valid optional fromDate and toDate", async () => {
    const dto = Object.assign(new DateRangeQueryDto(), {
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("validates optional customerId for payment statistics", async () => {
    const dto = Object.assign(new PaymentStatisticsQueryDto(), {
      customerId: "not-a-uuid",
      fromDate: "2026-01-01",
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === "customerId")).toBe(true);
  });
});

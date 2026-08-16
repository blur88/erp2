import { OwnerEquityService } from "../owner-equity.service";
import {
  OwnerEquityDocumentStatus as DS,
  OwnerEquitySettlementStatus as SS,
} from "../../entities/owner-equity-document.entity";

describe("OwnerEquityService.computeAggregates", () => {
  it("reports UNSETTLED with no settlements", () => {
    expect(OwnerEquityService.computeAggregates("1000.0000", [])).toEqual({
      settledAmount: "0.0000",
      balance: "1000.0000",
      settlementStatus: SS.UNSETTLED,
    });
  });
  it("reports PARTIAL below the total", () => {
    expect(
      OwnerEquityService.computeAggregates("1000.0000", [
        { amount: "400.0000" },
      ]),
    ).toEqual({
      settledAmount: "400.0000",
      balance: "600.0000",
      settlementStatus: SS.PARTIAL,
    });
  });
  it("reports SETTLED at exactly the total", () => {
    expect(
      OwnerEquityService.computeAggregates("1000.0000", [
        { amount: "400.0000" },
        { amount: "600.0000" },
      ]),
    ).toEqual({
      settledAmount: "1000.0000",
      balance: "0.0000",
      settlementStatus: SS.SETTLED,
    });
  });
  it("nets refunds back out", () => {
    expect(
      OwnerEquityService.computeAggregates("1000.0000", [
        { amount: "1000.0000" },
        { amount: "-250.0000" },
      ]),
    ).toEqual({
      settledAmount: "750.0000",
      balance: "250.0000",
      settlementStatus: SS.PARTIAL,
    });
  });
});

describe("OwnerEquityService.deriveDocumentStatus", () => {
  it("promotes DRAFT to READY when fully settled", () => {
    expect(OwnerEquityService.deriveDocumentStatus(DS.DRAFT, SS.SETTLED)).toBe(
      DS.READY,
    );
  });
  it("demotes READY to DRAFT when a refund drops it below full", () => {
    expect(OwnerEquityService.deriveDocumentStatus(DS.READY, SS.PARTIAL)).toBe(
      DS.DRAFT,
    );
  });
  it("protects COMPLETED from automatic derivation", () => {
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.COMPLETED, SS.PARTIAL),
    ).toBe(DS.COMPLETED);
  });
  it("protects CANCELLED from automatic derivation", () => {
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.CANCELLED, SS.SETTLED),
    ).toBe(DS.CANCELLED);
  });
  it("does NOT promote OVERSETTLED to READY", () => {
    // Over-settlement means the balance is wrong; the document must stay
    // correctable rather than become completable.
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.DRAFT, SS.OVERSETTLED),
    ).toBe(DS.DRAFT);
    expect(
      OwnerEquityService.deriveDocumentStatus(DS.READY, SS.OVERSETTLED),
    ).toBe(DS.DRAFT);
  });
});

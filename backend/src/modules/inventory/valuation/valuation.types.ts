import { CostingMethod } from "../../../common/costing/supported-costing-methods";
import { StockValuationEntryKind } from "../../../database/entities/stock-valuation-entry.entity";

export interface PendingValuation {
  productId: string;
  kind: StockValuationEntryKind;
  method: CostingMethod;
  quantityMinor: bigint;
  valueCents: bigint;
  runningQuantityMinor: bigint;
  runningValueCents: bigint;
  layerDraws: Array<{ layerId: string; qty: bigint; value: bigint }>;
  openLayer?: { qty: bigint; unitValueScale4: bigint; value: bigint };
  closeLayerId?: string;
  reversesEntryId?: string;
  defaultUnitValueScale4?: bigint | null;
  explanation?: string | null;
}

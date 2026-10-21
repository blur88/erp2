import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Auth } from '../../auth/decorators/auth.decorator';
import { InventoryValuationService } from './inventory-valuation.service';
import { toMinorUnits, formatScale4 } from '../../../common/utils/money';
import { unitValueScale4 } from './valuation-math';

@Auth()
@Controller('inventory/valuation')
export class ValuationController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly valuation: InventoryValuationService,
  ) {}

  @Get('status')
  async status(): Promise<{ active: boolean; method: 'AVERAGE' | 'FIFO' }> {
    const manager = this.dataSource.manager;
    const active = await this.valuation.isActive(manager);
    return { active, method: await this.valuation.currentMethod(manager) };
  }

  @Get('products/:id')
  async product(@Param('id', ParseUUIDPipe) id: string): Promise<{
    quantityOnHand: string;
    valueOnHand: string;
    unitValue: string | null;
  } | null> {
    const [balance] = await this.dataSource.query(
      `SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`,
      [id],
    );
    if (!balance) return null;
    const quantity = toMinorUnits(balance.quantity);
    const valueCents = toMinorUnits(balance.value) / 100n;
    const unit = unitValueScale4(quantity, valueCents);
    return {
      quantityOnHand: balance.quantity,
      valueOnHand: balance.value,
      unitValue: unit == null ? null : formatScale4(unit),
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegionalSettings } from '../../../../database/entities/regional-settings.entity';
import { IBaseCostingStrategy } from './base-costing-strategy.interface';
import { AverageCostingStrategy } from './average-costing-strategy.service';
import { FifoCostingStrategy } from './fifo-costing-strategy.service';
import { LifoCostingStrategy } from './lifo-costing-strategy.service';
import { StandardCostingStrategy } from './standard-costing-strategy.service';

/**
 * Factory service to get the appropriate costing strategy based on settings
 */
@Injectable()
export class CostingStrategyFactory {
  private readonly logger = new Logger(CostingStrategyFactory.name);

  private readonly strategies: Map<string, IBaseCostingStrategy>;

  constructor(
    @InjectRepository(RegionalSettings)
    private regionalSettingsRepository: Repository<RegionalSettings>,
    private averageStrategy: AverageCostingStrategy,
    private fifoStrategy: FifoCostingStrategy,
    private lifoStrategy: LifoCostingStrategy,
    private standardStrategy: StandardCostingStrategy,
  ) {
    // Initialize strategy map
    this.strategies = new Map<string, IBaseCostingStrategy>([
      ['AVERAGE', this.averageStrategy],
      ['FIFO', this.fifoStrategy],
      ['LIFO', this.lifoStrategy],
      ['STANDARD', this.standardStrategy],
    ]);
  }

  /**
   * Get the active costing strategy based on current settings
   */
  async getActiveStrategy(): Promise<IBaseCostingStrategy> {
    try {
      const settings = await this.regionalSettingsRepository.findOne({
        where: { isActive: true },
      });

      const costingMethod = settings?.costingMethod || 'AVERAGE';
      const strategy = this.strategies.get(costingMethod);

      if (!strategy) {
        this.logger.warn(
          `Unknown costing method "${costingMethod}", falling back to AVERAGE`,
        );
        return this.averageStrategy;
      }

      this.logger.debug(`Using costing strategy: ${costingMethod}`);
      return strategy;
    } catch (error) {
      this.logger.error(
        `Failed to get active costing strategy: ${error.message}`,
        error.stack,
      );
      // Fallback to AVERAGE on error
      return this.averageStrategy;
    }
  }

  /**
   * Get a specific costing strategy by method name
   * Useful for migration/recalculation operations
   */
  getStrategyByMethod(method: string): IBaseCostingStrategy {
    const strategy = this.strategies.get(method.toUpperCase());
    if (!strategy) {
      this.logger.warn(
        `Unknown costing method "${method}", falling back to AVERAGE`,
      );
      return this.averageStrategy;
    }
    return strategy;
  }

  /**
   * Get current costing method from settings
   */
  async getCurrentCostingMethod(): Promise<string> {
    try {
      const settings = await this.regionalSettingsRepository.findOne({
        where: { isActive: true },
      });
      return settings?.costingMethod || 'AVERAGE';
    } catch (error) {
      this.logger.error(
        `Failed to get current costing method: ${error.message}`,
        error.stack,
      );
      return 'AVERAGE';
    }
  }

  /**
   * Get all available costing methods
   */
  getAvailableMethods(): string[] {
    return Array.from(this.strategies.keys());
  }
}

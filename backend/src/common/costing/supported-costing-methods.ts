export const SUPPORTED_COSTING_METHODS = ['AVERAGE', 'FIFO'] as const;

export type CostingMethod = (typeof SUPPORTED_COSTING_METHODS)[number];

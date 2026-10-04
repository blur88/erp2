import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BankReconciliation } from '../entities/bank-reconciliation.entity';

export async function lockBankAccount(
  manager: EntityManager,
  bankAccountId: string,
): Promise<{ id: string; code: string; name: string; isActive: boolean; isBankAccount: boolean }> {
  const [row] = await manager.query(
    `SELECT id, code, name, "isActive", "isBankAccount"
       FROM chart_of_account
      WHERE id = $1
      FOR NO KEY UPDATE`,
    [bankAccountId],
  );
  if (!row) {
    throw new NotFoundException(`Chart of account ${bankAccountId} not found`);
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: Boolean(row.isActive),
    isBankAccount: Boolean(row.isBankAccount),
  };
}

export async function lockReconciliation(
  manager: EntityManager,
  id: string,
): Promise<BankReconciliation> {
  const reconciliation = await manager.findOne(BankReconciliation, {
    where: { id },
    lock: { mode: 'pessimistic_write' },
  });
  if (!reconciliation) {
    throw new NotFoundException(`Bank reconciliation ${id} not found`);
  }
  return reconciliation;
}

export function assertWritableAccount(a: { isActive: boolean; isBankAccount: boolean }): void {
  if (!a.isActive || !a.isBankAccount) {
    throw new ConflictException(
      'Bank account is not an active bank account; this reconciliation is read-only.',
    );
  }
}

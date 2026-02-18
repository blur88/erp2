import { ApiService } from './api';
import {
  ChartOfAccount,
  JournalEntry,
  FiscalPeriod,
  BankReconciliation,
  PaginatedResponse,
} from '@/types';
import {
  AccountMapping,
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
  AccountMappingValidationResult,
} from '@/types/accountMapping';

const BASE_URL = '/accounting';

// Chart of Accounts API
export const chartOfAccountsApi = {
  // List with pagination and filters
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    isActive?: boolean;
    parentId?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<PaginatedResponse<ChartOfAccount>> => {
    return ApiService.get(`${BASE_URL}/chart-of-accounts`, { params });
  },

  // Get single account
  getById: (id: string): Promise<ChartOfAccount> => {
    return ApiService.get(`${BASE_URL}/chart-of-accounts/${id}`);
  },

  // Get hierarchical structure
  getHierarchy: (): Promise<{ data: ChartOfAccount[]; meta: any }> => {
    return ApiService.get(`${BASE_URL}/chart-of-accounts/hierarchy`);
  },

  // Create account
  create: (data: Partial<ChartOfAccount>): Promise<ChartOfAccount> => {
    return ApiService.post(`${BASE_URL}/chart-of-accounts`, data);
  },

  // Update account
  update: (id: string, data: Partial<ChartOfAccount>): Promise<ChartOfAccount> => {
    return ApiService.patch(`${BASE_URL}/chart-of-accounts/${id}`, data);
  },

  // Soft delete account
  delete: (id: string): Promise<void> => {
    return ApiService.delete(`${BASE_URL}/chart-of-accounts/${id}`);
  },

  // Restore deleted account
  restore: (id: string): Promise<ChartOfAccount> => {
    return ApiService.post(`${BASE_URL}/chart-of-accounts/${id}/restore`);
  },

  // Seed default accounts
  seedDefaults: (): Promise<{ data: ChartOfAccount[]; message: string }> => {
    return ApiService.post(`${BASE_URL}/chart-of-accounts/seed-defaults`);
  },
};

// Journal Entries API
export const journalEntriesApi = {
  // List with pagination and filters
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    fiscalPeriodId?: string;
    sourceType?: string;
    sourceId?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<PaginatedResponse<JournalEntry>> => {
    return ApiService.get(`${BASE_URL}/journal-entries`, { params });
  },

  // Get single entry with lines
  getById: (id: string): Promise<JournalEntry> => {
    return ApiService.get(`${BASE_URL}/journal-entries/${id}`);
  },

  // Create entry
  create: (data: Partial<JournalEntry>): Promise<JournalEntry> => {
    return ApiService.post(`${BASE_URL}/journal-entries`, data);
  },

  // Update entry (only in DRAFT status)
  update: (id: string, data: Partial<JournalEntry>): Promise<JournalEntry> => {
    return ApiService.patch(`${BASE_URL}/journal-entries/${id}`, data);
  },

  // Soft delete entry
  delete: (id: string): Promise<void> => {
    return ApiService.delete(`${BASE_URL}/journal-entries/${id}`);
  },

  // Post entry (change status to POSTED)
  post: (id: string): Promise<JournalEntry> => {
    return ApiService.post(`${BASE_URL}/journal-entries/${id}/post`);
  },

  // Reverse entry (create reversing entry)
  reverse: (id: string, reverseDate?: string): Promise<JournalEntry> => {
    return ApiService.post(`${BASE_URL}/journal-entries/${id}/reverse`, {
      reverseDate,
    });
  },

  // Bulk post entries
  bulkPostEntries: (ids: string[]): Promise<any> => {
    return ApiService.post(`${BASE_URL}/journal-entries/bulk-post`, { ids });
  },

  // Bulk delete entries
  bulkDeleteEntries: (ids: string[]): Promise<any> => {
    return ApiService.post(`${BASE_URL}/journal-entries/bulk-delete`, { ids });
  },
};

// Fiscal Periods API
export const fiscalPeriodsApi = {
  // List with pagination and filters
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    year?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<PaginatedResponse<FiscalPeriod>> => {
    return ApiService.get(`${BASE_URL}/fiscal-periods`, { params });
  },

  // Get single period
  getById: (id: string): Promise<FiscalPeriod> => {
    return ApiService.get(`${BASE_URL}/fiscal-periods/${id}`);
  },

  // Get current period (today's date)
  getCurrent: (): Promise<FiscalPeriod> => {
    return ApiService.get(`${BASE_URL}/fiscal-periods/current`);
  },

  // Create period
  create: (data: Partial<FiscalPeriod>): Promise<FiscalPeriod> => {
    return ApiService.post(`${BASE_URL}/fiscal-periods`, data);
  },

  // Update period
  update: (id: string, data: Partial<FiscalPeriod>): Promise<FiscalPeriod> => {
    return ApiService.patch(`${BASE_URL}/fiscal-periods/${id}`, data);
  },

  // Soft delete period
  delete: (id: string): Promise<void> => {
    return ApiService.delete(`${BASE_URL}/fiscal-periods/${id}`);
  },

  // Close period
  close: (id: string): Promise<FiscalPeriod> => {
    return ApiService.post(`${BASE_URL}/fiscal-periods/${id}/close`);
  },

  // Reopen period
  reopen: (id: string): Promise<FiscalPeriod> => {
    return ApiService.post(`${BASE_URL}/fiscal-periods/${id}/reopen`);
  },

  // Generate periods for a year
  generate: (year: number, startMonth?: number): Promise<{ data: FiscalPeriod[]; message: string }> => {
    return ApiService.post(`${BASE_URL}/fiscal-periods/generate`, {
      year,
      startMonth: startMonth || 1,
    });
  },

  // Validate a date against fiscal periods
  validate: (date: string): Promise<{
    isValid: boolean;
    message: string;
    period?: FiscalPeriod;
  }> => {
    return ApiService.post(`${BASE_URL}/fiscal-periods/validate`, { date });
  },
};

// Account Mappings API
export const accountMappingsApi = {
  // Get all mappings
  getAll: (): Promise<{ data: AccountMapping[] }> => {
    return ApiService.get(`${BASE_URL}/account-mappings`, { params: { limit: 100 } });
  },

  // Validate mappings
  validate: (): Promise<AccountMappingValidationResult> => {
    return ApiService.get(`${BASE_URL}/account-mappings/validate`);
  },

  // Get single mapping
  getById: (id: string): Promise<AccountMapping> => {
    return ApiService.get(`${BASE_URL}/account-mappings/${id}`);
  },

  // Create mapping
  create: (data: CreateAccountMappingDto): Promise<AccountMapping> => {
    return ApiService.post(`${BASE_URL}/account-mappings`, data);
  },

  // Update mapping
  update: (id: string, data: UpdateAccountMappingDto): Promise<AccountMapping> => {
    return ApiService.patch(`${BASE_URL}/account-mappings/${id}`, data);
  },

  // Delete mapping
  delete: (id: string): Promise<void> => {
    return ApiService.delete(`${BASE_URL}/account-mappings/${id}`);
  },
};

// Bank Reconciliations API
export const bankReconciliationsApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    accountId?: string;
    fiscalPeriodId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<PaginatedResponse<BankReconciliation>> => {
    return ApiService.get(`${BASE_URL}/bank-reconciliations`, { params });
  },

  getById: (id: string): Promise<BankReconciliation> => {
    return ApiService.get(`${BASE_URL}/bank-reconciliations/${id}`);
  },

  create: (data: {
    accountId: string;
    fiscalPeriodId: string;
    reconciliationDate: string;
    statementBalance: number;
  }): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations`, data);
  },

  update: (id: string, data: {
    reconciliationDate?: string;
    statementBalance?: number;
  }): Promise<BankReconciliation> => {
    return ApiService.patch(`${BASE_URL}/bank-reconciliations/${id}`, data);
  },

  delete: (id: string): Promise<void> => {
    return ApiService.delete(`${BASE_URL}/bank-reconciliations/${id}`);
  },

  markCleared: (id: string, journalEntryLineIds: string[]): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations/${id}/mark-cleared`, {
      journalEntryLineIds,
    });
  },

  unmarkCleared: (id: string, journalEntryLineIds: string[]): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations/${id}/unmark-cleared`, {
      journalEntryLineIds,
    });
  },

  complete: (id: string): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations/${id}/complete`);
  },

  reopen: (id: string): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations/${id}/reopen`);
  },
};

export const accountingApi = {
  chartOfAccounts: chartOfAccountsApi,
  journalEntries: journalEntriesApi,
  fiscalPeriods: fiscalPeriodsApi,
  accountMappings: accountMappingsApi,
  bankReconciliations: bankReconciliationsApi,
};

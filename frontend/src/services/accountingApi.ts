import { ApiService } from './api';
import {
  JournalEntry,
  PaginatedResponse,
} from '@/types';

const BASE_URL = '/accounting';

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


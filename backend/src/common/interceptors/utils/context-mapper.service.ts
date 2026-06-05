import { Injectable } from '@nestjs/common';

export interface BusinessContext {
  module: string;
  operation?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

@Injectable()
export class BusinessContextMapperService {
  getBusinessContext(url: string): BusinessContext {
    if (url.includes('/inventory/')) {
      return { module: 'INVENTORY', priority: 'HIGH' };
    }
    if (url.includes('/sales/')) {
      return { module: 'SALES', priority: 'CRITICAL' };
    }
    if (url.includes('/dashboard/')) {
      return { module: 'DASHBOARD', priority: 'MEDIUM' };
    }
    if (url.includes('/users/')) {
      return { module: 'USERS', priority: 'HIGH' };
    }

    return { module: 'GENERAL', priority: 'LOW' };
  }

  shouldLogResponseBody(url: string): boolean {
    const excludePatterns = [
      '/users',
      '/upload',
      '/download',
      '/inventory/products',
      '/api/health',
    ];
    return !excludePatterns.some((pattern) => url.includes(pattern));
  }
}
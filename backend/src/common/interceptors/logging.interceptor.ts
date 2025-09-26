import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PerformanceInterceptor } from './monitoring/performance.interceptor';
import { DataSanitizationInterceptor } from './security/data-sanitization.interceptor';
import { DataSanitizerService } from './utils/sanitizer.service';
import { BusinessContextMapperService } from './utils/context-mapper.service';

/**
 * Modular Logging Interceptor
 * Combines performance monitoring and data sanitization interceptors
 * for comprehensive request/response logging
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly performanceInterceptor: PerformanceInterceptor;
  private readonly sanitizationInterceptor: DataSanitizationInterceptor;

  constructor() {
    const contextMapper = new BusinessContextMapperService();
    const sanitizer = new DataSanitizerService();

    this.performanceInterceptor = new PerformanceInterceptor(contextMapper);
    this.sanitizationInterceptor = new DataSanitizationInterceptor(
      contextMapper,
      sanitizer,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Compose both interceptors - performance monitoring with data sanitization
    return this.sanitizationInterceptor.intercept(context, {
      handle: () => this.performanceInterceptor.intercept(context, next),
    });
  }
}
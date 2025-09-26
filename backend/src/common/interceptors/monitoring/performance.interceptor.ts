import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { BaseLoggingInterceptor } from '../core/base-logging.interceptor';
import { BusinessContextMapperService } from '../utils/context-mapper.service';

@Injectable()
export class PerformanceInterceptor extends BaseLoggingInterceptor {
  protected readonly logger = new Logger(PerformanceInterceptor.name);
  private readonly SLOW_REQUEST_THRESHOLD = 3000; // 3 seconds for ERP operations
  private readonly LARGE_REQUEST_THRESHOLD = 1000000; // 1MB

  constructor(contextMapper: BusinessContextMapperService) {
    super(contextMapper);
  }

  protected logSuccess(
    requestInfo: any,
    response: Response,
    body: any,
    startTime: number,
  ): void {
    super.logSuccess(requestInfo, response, body, startTime);

    const duration = Date.now() - startTime;
    const contentLength = parseInt(requestInfo.contentLength);

    // Log slow requests as warnings
    if (duration > this.SLOW_REQUEST_THRESHOLD) {
      this.logger.warn(
        `Slow ERP operation: ${requestInfo.method} ${requestInfo.url} [${requestInfo.businessContext.module}] took ${duration}ms`,
      );
    }

    // Log large requests
    if (contentLength > this.LARGE_REQUEST_THRESHOLD) {
      this.logger.warn(
        `Large request: ${requestInfo.url} - Size: ${requestInfo.contentLength}B`,
      );
    }
  }
}
import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { BaseLoggingInterceptor } from '../core/base-logging.interceptor';
import { DataSanitizerService } from '../utils/sanitizer.service';
import { BusinessContextMapperService } from '../utils/context-mapper.service';

@Injectable()
export class DataSanitizationInterceptor extends BaseLoggingInterceptor {
  protected readonly logger = new Logger(DataSanitizationInterceptor.name);

  constructor(
    contextMapper: BusinessContextMapperService,
    private readonly sanitizer: DataSanitizerService,
  ) {
    super(contextMapper);
  }

  protected logRequest(requestInfo: any): void {
    super.logRequest(requestInfo);

    // Log sanitized request body for debugging (in development only)
    if (requestInfo.body && Object.keys(requestInfo.body).length > 0) {
      const sanitizedBody = this.sanitizer.sanitizeRequestBody(requestInfo.body);
      this.logger.debug(`Request Body: ${JSON.stringify(sanitizedBody)}`);
    }
  }

  protected logSuccess(
    requestInfo: any,
    response: Response,
    body: any,
    startTime: number,
  ): void {
    super.logSuccess(requestInfo, response, body, startTime);

    // Log sanitized response body for debugging (in development only)
    if (
      process.env.NODE_ENV === 'development' &&
      this.contextMapper.shouldLogResponseBody(requestInfo.url)
    ) {
      const sanitizedBody = this.sanitizer.sanitizeResponseBody(body);
      this.logger.debug(
        `Response Body: ${JSON.stringify(sanitizedBody)}`,
      );
    }
  }
}
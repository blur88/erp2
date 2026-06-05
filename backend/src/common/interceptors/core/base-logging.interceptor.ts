import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { Request, Response } from "express";
import { BusinessContextMapperService } from "../utils/context-mapper.service";

@Injectable()
export class BaseLoggingInterceptor implements NestInterceptor {
  protected readonly logger = new Logger(BaseLoggingInterceptor.name);

  constructor(protected readonly contextMapper: BusinessContextMapperService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    const requestInfo = this.extractRequestInfo(request);
    this.logRequest(requestInfo);

    return next.handle().pipe(
      tap((responseBody) =>
        this.logSuccess(requestInfo, response, responseBody, startTime),
      ),
      catchError((error) => this.logError(requestInfo, error, startTime)),
    );
  }

  protected extractRequestInfo(request: Request) {
    const { method, url, ip, headers, body } = request;
    const businessContext = this.contextMapper.getBusinessContext(url);

    return {
      method,
      url,
      ip,
      body,
      userAgent: headers["user-agent"] || "",
      contentLength: headers["content-length"] || "0",
      businessContext,
      timestamp: new Date().toISOString(),
    };
  }

  protected logRequest(requestInfo: any): void {
    this.logger.log(
      `→ ${requestInfo.method} ${requestInfo.url} [${requestInfo.businessContext.module}] - IP: ${requestInfo.ip} - Size: ${requestInfo.contentLength}B`,
    );
  }

  protected logSuccess(
    requestInfo: any,
    response: Response,
    body: any,
    startTime: number,
  ): void {
    const duration = Date.now() - startTime;
    this.logger.log(
      `← ${response.statusCode} ${requestInfo.method} ${requestInfo.url} [${requestInfo.businessContext.module}] - Duration: ${duration}ms`,
    );
  }

  protected logError(requestInfo: any, error: any, startTime: number): never {
    const duration = Date.now() - startTime;
    const statusCode = error.status || 500;

    this.logger.error(
      `← ${statusCode} ${requestInfo.method} ${requestInfo.url} [${requestInfo.businessContext.module}] - Duration: ${duration}ms - Error: ${error.message}`,
      error.stack,
    );

    throw error;
  }
}

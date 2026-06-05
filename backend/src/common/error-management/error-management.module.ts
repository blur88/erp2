import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { DetailedErrorFilter } from "./detailed-error.filter";
import { HttpExceptionFilter } from "./http-exception.filter";
import { ErrorClassifierService } from "./services/error-classifier.service";
import { ErrorLoggerService } from "./services/error-logger.service";
import { ErrorSanitizerService } from "./services/error-sanitizer.service";
import { IdGeneratorService } from "./services/id-generator.service";
import { LogFormatterService } from "./services/log-formatter.service";
import { SecurityDetectorService } from "./services/security-detector.service";

@Global()
@Module({
  providers: [
    ErrorSanitizerService,
    ErrorClassifierService,
    IdGeneratorService,
    LogFormatterService,
    ErrorLoggerService,
    SecurityDetectorService,
    {
      provide: APP_FILTER,
      useClass: DetailedErrorFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
  exports: [
    ErrorLoggerService,
    ErrorSanitizerService,
    ErrorClassifierService,
    SecurityDetectorService,
  ],
})
export class ErrorManagementModule {}

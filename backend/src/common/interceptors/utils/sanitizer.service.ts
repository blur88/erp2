import { Injectable } from "@nestjs/common";

@Injectable()
export class DataSanitizerService {
  private readonly genericSensitiveFields = [
    "password",
    "currentPassword",
    "newPassword",
    "confirmPassword",
    "token",
    "refreshToken",
    "accessToken",
    "secret",
    "key",
    "apiKey",
    "authorization",
  ];

  private readonly erpSensitiveFields = [
    "cost",
    "wholesalePrice",
    "taxRate",
    "margin",
    "discount",
  ];

  sanitizeRequestBody(body: any): any {
    return this.sanitizeObject(body, [
      ...this.genericSensitiveFields,
      ...this.erpSensitiveFields,
    ]);
  }

  sanitizeResponseBody(body: any): any {
    const sanitized = this.sanitizeObject(body, this.genericSensitiveFields);

    // Handle nested token objects
    if (sanitized?.tokens) {
      sanitized.tokens = {
        ...sanitized.tokens,
        accessToken: "[REDACTED]",
        refreshToken: "[REDACTED]",
      };
    }

    return sanitized;
  }

  private sanitizeObject(obj: any, sensitiveFields: string[]): any {
    if (!obj || typeof obj !== "object") return obj;

    const sanitized = { ...obj };
    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = "[REDACTED]";
      }
    });

    return sanitized;
  }
}

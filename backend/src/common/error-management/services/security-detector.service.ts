import { Injectable } from "@nestjs/common";
import { isSecurityError } from "../utils/error-classification.util";

@Injectable()
export class SecurityDetectorService {
  isSecurityRelated(status: number, error: string): boolean {
    return isSecurityError(status, error);
  }
}

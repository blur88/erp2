import { ValidationError } from "class-validator";

export function extractValidationMessages(errors: ValidationError[]): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    const constraints = Object.values(error.constraints || {});
    if (constraints.length > 0) {
      messages.push(...constraints);
    } else if (error.children && error.children.length > 0) {
      messages.push(...extractValidationMessages(error.children));
    } else {
      messages.push(`Validation failed for ${error.property}`);
    }
  }

  return messages;
}

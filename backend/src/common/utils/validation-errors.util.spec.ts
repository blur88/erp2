import { ValidationError } from "class-validator";
import { extractValidationMessages } from "./validation-errors.util";

function makeError(
  property: string,
  constraints?: Record<string, string>,
  children?: ValidationError[],
): ValidationError {
  const e = new ValidationError();
  e.property = property;
  e.constraints = constraints;
  e.children = children ?? [];
  return e;
}

describe("extractValidationMessages", () => {
  it("returns all constraints for a field with multiple validators", () => {
    const error = makeError("name", {
      isString: "name must be a string",
      minLength: "name must be at least 3 characters",
    });
    expect(extractValidationMessages([error])).toEqual([
      "name must be a string",
      "name must be at least 3 characters",
    ]);
  });

  it("returns constraints from multiple top-level fields", () => {
    const errors = [
      makeError("email", { isEmail: "email must be a valid email" }),
      makeError("age", { min: "age must be at least 0" }),
    ];
    expect(extractValidationMessages(errors)).toEqual([
      "email must be a valid email",
      "age must be at least 0",
    ]);
  });

  it("recurses into nested children", () => {
    const child = makeError("street", {
      isNotEmpty: "street must not be empty",
    });
    const parent = makeError("address", undefined, [child]);
    expect(extractValidationMessages([parent])).toEqual([
      "street must not be empty",
    ]);
  });

  it("recurses multiple levels deep", () => {
    const grandchild = makeError("zip", {
      isPostalCode: "zip must be a valid postal code",
    });
    const child = makeError("address", undefined, [grandchild]);
    const parent = makeError("shipping", undefined, [child]);
    expect(extractValidationMessages([parent])).toEqual([
      "zip must be a valid postal code",
    ]);
  });

  it("falls back to property name when no constraints and no children", () => {
    const error = makeError("mystery");
    expect(extractValidationMessages([error])).toEqual([
      "Validation failed for mystery",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(extractValidationMessages([])).toEqual([]);
  });
});

import { validate } from "class-validator";
import { CreateAccountMappingDto } from "./account-mapping.dto";
import { MappingType } from "../../../database/entities/account-mapping.entity";

describe("CreateAccountMappingDto", () => {
  const accountId = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts predefined mapping types", async () => {
    const dto = new CreateAccountMappingDto();
    dto.mappingType = MappingType.SALES_REVENUE;
    dto.accountId = accountId;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it("accepts dynamic payment mapping types", async () => {
    const dto = new CreateAccountMappingDto();
    dto.mappingType = "payment_cimb";
    dto.accountId = accountId;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it("accepts dynamic mapping types with underscore in payment method codes", async () => {
    const dto = new CreateAccountMappingDto();
    dto.mappingType = "vendor_payment_shopee_pay";
    dto.accountId = accountId;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it("accepts dynamic mapping types with spaces and hyphens in payment method codes", async () => {
    const dto = new CreateAccountMappingDto();
    dto.mappingType = "vendor_payment_maybank-qr";
    dto.accountId = accountId;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it("rejects unknown mapping types", async () => {
    const dto = new CreateAccountMappingDto();
    dto.mappingType = "invalid_type";
    dto.accountId = accountId;

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe("mappingType");
  });
});

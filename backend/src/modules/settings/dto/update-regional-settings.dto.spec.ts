import { validate } from "class-validator";
import { UpdateRegionalSettingsDto } from "./update-regional-settings.dto";

describe("UpdateRegionalSettingsDto", () => {
  it("accepts all supported date formats", async () => {
    const supportedFormats = [
      "DD/MM/YYYY",
      "DD-MM-YYYY",
      "MM/DD/YYYY",
      "MM-DD-YYYY",
      "YYYY-MM-DD",
      "DD MMM YYYY",
      "DD MMMM YYYY",
      "MMM DD, YYYY",
      "MMMM DD, YYYY",
    ];

    for (const dateFormat of supportedFormats) {
      const dto = new UpdateRegionalSettingsDto();
      dto.dateFormat = dateFormat;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it("rejects unsupported date formats", async () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.dateFormat = "YYYY/MM/DD";

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts valid IANA timezone strings", async () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.timezone = "Asia/Kuala_Lumpur";

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects invalid timezone strings", async () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.timezone = "Not/ATimezone";

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  describe("startOfWeek", () => {
    it("accepts 0 (Sunday)", async () => {
      const dto = new UpdateRegionalSettingsDto();
      dto.startOfWeek = 0;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("accepts 1 (Monday)", async () => {
      const dto = new UpdateRegionalSettingsDto();
      dto.startOfWeek = 1;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it("rejects 2", async () => {
      const dto = new UpdateRegionalSettingsDto();
      dto.startOfWeek = 2;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects -1", async () => {
      const dto = new UpdateRegionalSettingsDto();
      dto.startOfWeek = -1;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

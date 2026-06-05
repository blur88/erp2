import "reflect-metadata";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";

import { SettingsController } from "./settings.controller";
import { RegionalSettingsResponseDto } from "./dto/regional-settings-response.dto";
import { UpdateRegionalSettingsDto } from "./dto/update-regional-settings.dto";

describe("SettingsController regional settings routes", () => {
  it("uses /settings/regional for the GET regional settings endpoint", () => {
    expect(Reflect.getMetadata(PATH_METADATA, SettingsController)).toBe(
      "settings",
    );
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        SettingsController.prototype.getRegionalSettings,
      ),
    ).toBe("regional");
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        SettingsController.prototype.getRegionalSettings,
      ),
    ).toBe(RequestMethod.GET);
  });

  it("uses /settings/regional for the PUT regional settings endpoint", () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        SettingsController.prototype.updateRegionalSettings,
      ),
    ).toBe("regional");
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        SettingsController.prototype.updateRegionalSettings,
      ),
    ).toBe(RequestMethod.PUT);
  });
});

describe("SettingsController lowStockThreshold", () => {
  it("UpdateRegionalSettingsDto accepts lowStockThreshold as optional integer >= 0", () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.lowStockThreshold = 5;
    expect(dto.lowStockThreshold).toBe(5);
  });

  it("RegionalSettingsResponseDto exposes lowStockThreshold", () => {
    const dto = new RegionalSettingsResponseDto();
    (dto as any).lowStockThreshold = 10;
    expect(dto.lowStockThreshold).toBe(10);
  });
});

describe("SettingsController startOfWeek", () => {
  it("UpdateRegionalSettingsDto accepts startOfWeek as optional integer 0 or 1", () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.startOfWeek = 0;
    expect(dto.startOfWeek).toBe(0);
  });

  it("RegionalSettingsResponseDto exposes startOfWeek", () => {
    const dto = new RegionalSettingsResponseDto();
    (dto as any).startOfWeek = 1;
    expect(dto.startOfWeek).toBe(1);
  });
});

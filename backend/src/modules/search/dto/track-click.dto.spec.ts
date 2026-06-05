import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { TrackClickDto } from "./track-click.dto";
import { SearchResultType } from "../search-result-type.enum";

describe("TrackClickDto", () => {
  function make(overrides: Partial<TrackClickDto> = {}): TrackClickDto {
    return plainToInstance(TrackClickDto, {
      query: "acme",
      resultType: SearchResultType.CUSTOMER,
      resultId: "some-id",
      position: 1,
      ...overrides,
    });
  }

  it("passes with minimal valid payload", async () => {
    const errors = await validate(make());
    expect(errors).toHaveLength(0);
  });

  it("passes with all optional fields", async () => {
    const errors = await validate(
      make({
        searchQueryId: "550e8400-e29b-41d4-a716-446655440000",
        resultLabel: "Acme Corp",
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it("rejects invalid resultType", async () => {
    const errors = await validate(make({ resultType: "invalid" as any }));
    expect(errors.some((e) => e.property === "resultType")).toBe(true);
  });

  it("rejects position < 1", async () => {
    const errors = await validate(make({ position: 0 }));
    expect(errors.some((e) => e.property === "position")).toBe(true);
  });

  it("rejects position > 20", async () => {
    const errors = await validate(make({ position: 21 }));
    expect(errors.some((e) => e.property === "position")).toBe(true);
  });

  it("rejects invalid UUID for searchQueryId", async () => {
    const errors = await validate(make({ searchQueryId: "not-a-uuid" }));
    expect(errors.some((e) => e.property === "searchQueryId")).toBe(true);
  });

  it("accepts missing searchQueryId", async () => {
    const dto = make();
    delete (dto as any).searchQueryId;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

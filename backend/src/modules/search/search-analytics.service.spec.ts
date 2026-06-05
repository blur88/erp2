import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SearchAnalyticsService } from "./search-analytics.service";
import { SearchQuery } from "../../database/entities/search-query.entity";
import { SearchClick } from "../../database/entities/search-click.entity";

describe("SearchAnalyticsService", () => {
  let service: SearchAnalyticsService;
  let queryRepo: { save: jest.Mock };
  let clickRepo: { save: jest.Mock };

  beforeEach(async () => {
    queryRepo = { save: jest.fn().mockResolvedValue({}) };
    clickRepo = { save: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchAnalyticsService,
        { provide: getRepositoryToken(SearchQuery), useValue: queryRepo },
        { provide: getRepositoryToken(SearchClick), useValue: clickRepo },
      ],
    }).compile();

    service = module.get(SearchAnalyticsService);
  });

  describe("logQuery()", () => {
    const params = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      query: "acme",
      userId: "user-uuid",
      resultCount: 5,
      executionTimeMs: 42,
    };

    it("calls queryRepo.save with correct data", async () => {
      service.logQuery(params);
      await new Promise((resolve) => setImmediate(resolve));

      expect(queryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: params.id,
          query: params.query,
          userId: params.userId,
          resultCount: params.resultCount,
          executionTimeMs: params.executionTimeMs,
        }),
      );
    });

    it("does not throw when repo.save rejects", async () => {
      queryRepo.save.mockRejectedValueOnce(new Error("db error"));

      expect(() => service.logQuery(params)).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe("logClick()", () => {
    const params = {
      searchQueryId: "550e8400-e29b-41d4-a716-446655440000",
      query: "acme",
      resultType: "customer",
      resultId: "cust-uuid",
      resultLabel: "Acme Corp",
      position: 1,
    };

    it("calls clickRepo.save with correct data", async () => {
      service.logClick(params);
      await new Promise((resolve) => setImmediate(resolve));

      expect(clickRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          searchQueryId: params.searchQueryId,
          query: params.query,
          resultType: params.resultType,
          resultId: params.resultId,
          resultLabel: params.resultLabel,
          position: params.position,
        }),
      );
    });

    it("does not throw when repo.save rejects", async () => {
      clickRepo.save.mockRejectedValueOnce(new Error("db error"));

      expect(() => service.logClick(params)).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
    });

    it("accepts undefined searchQueryId", async () => {
      const paramsNoId = { ...params, searchQueryId: undefined };

      expect(() => service.logClick(paramsNoId)).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      expect(clickRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          searchQueryId: null,
        }),
      );
    });
  });
});

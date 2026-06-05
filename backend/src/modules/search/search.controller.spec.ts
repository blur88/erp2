import { Test, TestingModule } from "@nestjs/testing";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { SearchAnalyticsService } from "./search-analytics.service";
import { SearchResultType } from "./search-result-type.enum";

describe("SearchController", () => {
  let controller: SearchController;
  let analyticsService: { logClick: jest.Mock };

  beforeEach(async () => {
    analyticsService = { logClick: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        {
          provide: SearchService,
          useValue: {
            search: jest.fn().mockResolvedValue({
              query: "",
              searchQueryId: "sq-id",
              results: [],
            }),
          },
        },
        {
          provide: SearchAnalyticsService,
          useValue: analyticsService,
        },
      ],
    }).compile();

    controller = module.get(SearchController);
  });

  it("POST /search/click calls logClick and returns undefined", async () => {
    const dto = {
      query: "acme",
      resultType: SearchResultType.CUSTOMER,
      resultId: "cust-1",
      resultLabel: "Acme Corp",
      position: 1,
    };

    const result = await controller.trackClick(
      dto as any,
      {
        user: { userId: "u1" },
      } as any,
    );

    expect(analyticsService.logClick).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "acme",
        resultType: SearchResultType.CUSTOMER,
        resultId: "cust-1",
        position: 1,
      }),
    );
    expect(result).toBeUndefined();
  });
});

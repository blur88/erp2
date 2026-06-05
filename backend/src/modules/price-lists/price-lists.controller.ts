import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { PriceListsService } from "./services/price-lists.service";
import {
  CreatePriceListDto,
  UpdatePriceListDto,
  QueryPriceListsDto,
  BulkUpdatePricesDto,
  ApplyPercentageAdjustmentDto,
} from "./dto";

@ApiTags("Price Lists")
@Controller("price-lists")
export class PriceListsController {
  constructor(private readonly priceListsService: PriceListsService) {}

  @Get()
  @ApiOperation({ summary: "Get all price lists" })
  @ApiResponse({ status: 200, description: "Returns paginated price lists" })
  async findAll(@Query() query: QueryPriceListsDto) {
    return this.priceListsService.findAll(query);
  }

  @Get("effective")
  @ApiOperation({ summary: "Get all currently effective price lists" })
  @ApiResponse({ status: 200, description: "Returns effective price lists" })
  async getEffective() {
    return this.priceListsService.getEffectivePriceLists();
  }

  @Get("default")
  @ApiOperation({ summary: "Get the default price list" })
  @ApiResponse({ status: 200, description: "Returns the default price list" })
  async getDefault() {
    return this.priceListsService.getDefaultPriceList();
  }

  @Get("code/:code")
  @ApiOperation({ summary: "Get price list by code" })
  @ApiResponse({ status: 200, description: "Returns price list with items" })
  @ApiResponse({ status: 404, description: "Price list not found" })
  async findByCode(@Param("code") code: string) {
    return this.priceListsService.findByCode(code);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get price list by ID" })
  @ApiResponse({ status: 200, description: "Returns price list with items" })
  @ApiResponse({ status: 404, description: "Price list not found" })
  async findOne(@Param("id") id: string) {
    return this.priceListsService.findOne(id, true);
  }

  @Get(":id/items")
  @ApiOperation({ summary: "Get all items in a price list" })
  @ApiResponse({ status: 200, description: "Returns price list items" })
  async getItems(@Param("id") id: string) {
    return this.priceListsService.getItems(id);
  }

  @Get("product/:productId/items")
  @ApiOperation({ summary: "Get all price list items for a specific product" })
  @ApiResponse({
    status: 200,
    description: "Returns price list items for the product",
  })
  async getItemsForProduct(@Param("productId") productId: string) {
    return this.priceListsService.getItemsForProduct(productId);
  }

  @Get(":id/products/:productId")
  @ApiOperation({ summary: "Get price for a specific product in a price list" })
  @ApiResponse({ status: 200, description: "Returns price for the product" })
  async getPriceForProduct(
    @Param("id") id: string,
    @Param("productId") productId: string,
  ) {
    const price = await this.priceListsService.getPriceForProduct(
      id,
      productId,
    );
    return { price };
  }

  @Post()
  @ApiOperation({ summary: "Create a new price list" })
  @ApiResponse({ status: 201, description: "Price list created successfully" })
  @ApiResponse({ status: 409, description: "Price list code already exists" })
  async create(@Body() createDto: CreatePriceListDto) {
    return this.priceListsService.create(createDto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a price list" })
  @ApiResponse({ status: 200, description: "Price list updated successfully" })
  @ApiResponse({ status: 404, description: "Price list not found" })
  async update(@Param("id") id: string, @Body() updateDto: UpdatePriceListDto) {
    return this.priceListsService.update(id, updateDto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a price list" })
  @ApiResponse({ status: 204, description: "Price list deleted successfully" })
  @ApiResponse({ status: 400, description: "Cannot delete default price list" })
  @ApiResponse({ status: 404, description: "Price list not found" })
  async remove(@Param("id") id: string) {
    await this.priceListsService.remove(id);
  }

  @Post(":id/set-default")
  @ApiOperation({ summary: "Set a price list as default" })
  @ApiResponse({ status: 200, description: "Price list set as default" })
  @ApiResponse({ status: 404, description: "Price list not found" })
  async setDefault(@Param("id") id: string) {
    return this.priceListsService.setDefault(id);
  }

  @Post(":id/items/bulk")
  @ApiOperation({ summary: "Bulk update prices in a price list" })
  @ApiResponse({ status: 200, description: "Prices updated successfully" })
  @ApiResponse({ status: 404, description: "Price list not found" })
  async bulkUpdatePrices(
    @Param("id") id: string,
    @Body() bulkUpdateDto: BulkUpdatePricesDto,
  ) {
    return this.priceListsService.bulkUpdatePrices(id, bulkUpdateDto);
  }

  @Post(":id/copy")
  @ApiOperation({ summary: "Copy a price list" })
  @ApiResponse({ status: 201, description: "Price list copied successfully" })
  @ApiResponse({ status: 404, description: "Source price list not found" })
  @ApiResponse({ status: 409, description: "New code already exists" })
  async copy(
    @Param("id") id: string,
    @Body("code") code: string,
    @Body("name") name: string,
  ) {
    return this.priceListsService.copyPriceList(id, code, name);
  }

  @Post(":id/adjust")
  @ApiOperation({ summary: "Apply percentage adjustment to all prices" })
  @ApiResponse({ status: 200, description: "Prices adjusted successfully" })
  @ApiResponse({ status: 400, description: "No items found in price list" })
  @ApiResponse({ status: 404, description: "Price list not found" })
  async applyAdjustment(
    @Param("id") id: string,
    @Body() adjustmentDto: ApplyPercentageAdjustmentDto,
  ) {
    return this.priceListsService.applyPercentageAdjustment(id, adjustmentDto);
  }
}

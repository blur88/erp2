import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from "@nestjs/common";
import { Auth } from "../../auth/decorators/auth.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { UserRole } from "../../../database/entities/user.entity";
import { OwnerEquityService } from "../services/owner-equity.service";
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  QueryOwnerEquityDto,
} from "../dto/owner-equity.dto";

@Controller("accounting/owner-equity")
@Auth()
export class OwnerEquityController {
  constructor(private readonly ownerEquityService: OwnerEquityService) {}

  @Get()
  findAll(@Query() query: QueryOwnerEquityDto) {
    return this.ownerEquityService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.ownerEquityService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  create(
    @Body() dto: CreateOwnerEquityDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.ownerEquityService.create(dto, currentUserId, currentUsername);
  }

  @Patch(":id")
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateOwnerEquityDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.ownerEquityService.update(
      id,
      dto,
      currentUserId,
      currentUsername,
    );
  }

  @Delete(":id")
  @Auth(UserRole.ADMIN)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.ownerEquityService.remove(id, currentUserId, currentUsername);
  }

  @Post(":id/post")
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  post(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.ownerEquityService.post(id, currentUserId, currentUsername);
  }

  @Post(":id/reverse")
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  reverse(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ) {
    return this.ownerEquityService.reverse(id, currentUserId, currentUsername);
  }
}

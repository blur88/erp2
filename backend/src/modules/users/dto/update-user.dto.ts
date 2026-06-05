import { ApiProperty, PartialType, OmitType } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsBoolean } from "class-validator";
import { CreateUserDto } from "./create-user.dto";
import { UserStatus } from "../../../database/entities/user.entity";

/**
 * Update user DTO - excludes password which should be changed separately
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ["password"] as const),
) {
  @ApiProperty({
    description: "User account status",
    enum: UserStatus,
    example: UserStatus.ACTIVE,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: "Please provide a valid user status" })
  status?: UserStatus;

  @ApiProperty({
    description: "Whether the user account is active",
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Admin update user DTO - includes additional admin-only fields
 */
export class AdminUpdateUserDto extends UpdateUserDto {
  @ApiProperty({
    description: "Reset failed login attempts counter",
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  resetFailedAttempts?: boolean;

  @ApiProperty({
    description: "Unlock user account",
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  unlockAccount?: boolean;
}

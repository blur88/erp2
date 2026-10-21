import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import {
  PermissionGuard,
  REQUIRED_PERMISSION_METADATA,
} from "../guards/permission.guard";
import { Permission } from "../permissions";

export function RequirePermission(permission: Permission) {
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSION_METADATA, permission),
    UseGuards(JwtAuthGuard, PermissionGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: "Unauthorized - Invalid or expired token",
    }),
    ApiForbiddenResponse({ description: `Missing permission: ${permission}` }),
  );
}

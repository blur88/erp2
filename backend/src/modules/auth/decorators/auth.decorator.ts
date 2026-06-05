import { applyDecorators, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { Roles } from "./roles.decorator";
import { UserRole } from "@/database/entities/user.entity";

/**
 * Composite decorator for authentication and authorization
 * Combines JwtAuthGuard, RolesGuard, and Swagger documentation
 *
 * @param roles - Optional roles required to access the route
 *
 * @example
 * // Any authenticated user
 * @Auth()
 * async getProfile() { }
 *
 * // Admin and Manager only
 * @Auth(UserRole.ADMIN, UserRole.MANAGER)
 * async deleteUser() { }
 */
export function Auth(...roles: UserRole[]) {
  const decorators = [
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: "Unauthorized - Invalid or expired token",
    }),
  ];

  if (roles.length > 0) {
    decorators.push(
      Roles(...roles),
      ApiForbiddenResponse({
        description: "Forbidden - Insufficient permissions",
      }),
    );
  }

  return applyDecorators(...decorators);
}

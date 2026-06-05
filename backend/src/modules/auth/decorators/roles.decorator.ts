import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@/database/entities/user.entity";

/**
 * Decorator to specify required roles for a route
 * Used in conjunction with RolesGuard
 *
 * @example
 * @Roles(UserRole.ADMIN, UserRole.MANAGER)
 * async deleteUser(@Param('id') id: string) {
 *   // Only admins and managers can access
 * }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata("roles", roles);

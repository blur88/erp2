import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Decorator to extract the current user from the request object
 * User is populated by JwtAuthGuard after token validation
 *
 * @example
 * async getProfile(@CurrentUser() user: any) {
 *   return user; // { userId, username, email, role, ... }
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // If a specific field is requested, return that field
    // Otherwise return the entire user object
    return data ? user?.[data] : user;
  },
);

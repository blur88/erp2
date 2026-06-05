import { SetMetadata } from "@nestjs/common";

/**
 * Decorator to mark routes as public (bypass JWT authentication)
 * Use on routes like login, register that don't require authentication
 */
export const Public = () => SetMetadata("isPublic", true);

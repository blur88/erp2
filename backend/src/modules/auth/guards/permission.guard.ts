import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../../../database/entities/user.entity";
import { hasPermission, Permission } from "../permissions";

export const REQUIRED_PERMISSION_METADATA = "requiredPermission";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission>(
      REQUIRED_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!permission) return true;

    const user = context.switchToHttp().getRequest().user as
      { role: UserRole } | undefined;
    if (!user) {
      throw new UnauthorizedException(
        "You must be logged in to access this resource",
      );
    }
    if (!hasPermission(user.role, permission)) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
    return true;
  }
}

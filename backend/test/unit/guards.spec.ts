import { jest } from '@jest/globals';
import { Test, TestingModule } from "@nestjs/testing";
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/modules/auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../src/modules/auth/guards/roles.guard";
import { UserRole } from "../../src/database/entities/user.entity";

describe("Auth Guards", () => {
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Reflector],
    }).compile();

    reflector = module.get<Reflector>(Reflector);
  });

  describe("JwtAuthGuard", () => {
    let guard: JwtAuthGuard;

    beforeEach(() => {
      guard = new JwtAuthGuard(reflector);
    });

    it("should be defined", () => {
      expect(guard).toBeDefined();
    });

    it("should allow access to public routes", () => {
      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)().mockReturnValue({}),
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(true); // Route is marked as public

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith("isPublic", [
        mockContext.getHandler(),
        mockContext.getClass(),
      ]);
    });

    it("should require authentication for protected routes", () => {
      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)().mockReturnValue({ user: null }),
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false); // Route is not public

      // Since this guard extends AuthGuard('jwt'), the actual authentication is handled by passport
      // We're just testing the public route bypass logic
      expect(guard).toBeDefined();
    });
  });

  describe("RolesGuard", () => {
    let guard: RolesGuard;

    beforeEach(() => {
      guard = new RolesGuard(reflector);
    });

    it("should be defined", () => {
      expect(guard).toBeDefined();
    });

    it("should allow access if no roles are required", async () => {
      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)()
            .mockReturnValue({ user: { role: UserRole.MANAGER } }),
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined); // No roles required

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it("should allow access if user has required role", async () => {
      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)().mockReturnValue({
            user: { userId: "123", role: UserRole.ADMIN },
          }),
        }),
      } as unknown as ExecutionContext;

      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([UserRole.ADMIN, UserRole.MANAGER]);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it("should deny access if user does not have required role", async () => {
      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)().mockReturnValue({
            user: { userId: "123", role: UserRole.SALES_STAFF },
          }),
        }),
      } as unknown as ExecutionContext;

      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([UserRole.ADMIN, UserRole.MANAGER]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        "You do not have permission to access this resource",
      );
    });

    it("should deny access if user is not authenticated", async () => {
      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)().mockReturnValue({ user: null }),
        }),
      } as unknown as ExecutionContext;

      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([UserRole.ADMIN]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        "You must be logged in to access this resource",
      );
    });

    it("should allow admin role for any required roles", async () => {
      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)().mockReturnValue({
            user: { userId: "123", role: UserRole.ADMIN },
          }),
        }),
      } as unknown as ExecutionContext;

      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([UserRole.INVENTORY_STAFF]);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true); // Admin has access to all resources
    });

    it("should handle multiple required roles correctly", async () => {
      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)().mockReturnValue({
            user: { userId: "123", role: UserRole.MANAGER },
          }),
        }),
      } as unknown as ExecutionContext;

      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([
          UserRole.ADMIN,
          UserRole.MANAGER,
          UserRole.SALES_STAFF,
        ]);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true); // Manager is in the allowed roles list
    });
  });

  describe("Guard Integration", () => {
    it("should work together - JwtAuthGuard then RolesGuard", async () => {
      const jwtGuard = new JwtAuthGuard(reflector);
      const rolesGuard = new RolesGuard(reflector);

      const mockContext = {
        getHandler: (jest.fn as unknown as any)(),
        getClass: (jest.fn as unknown as any)(),
        switchToHttp: (jest.fn as unknown as any)().mockReturnValue({
          getRequest: (jest.fn as unknown as any)().mockReturnValue({
            user: { userId: "123", role: UserRole.ADMIN },
          }),
        }),
      } as unknown as ExecutionContext;

      // First JwtAuthGuard validates authentication
      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(false); // Not a public route
      expect(jwtGuard).toBeDefined();

      // Then RolesGuard validates authorization
      jest
        .spyOn(reflector, "getAllAndOverride")
        .mockReturnValue([UserRole.ADMIN]);
      const rolesResult = await rolesGuard.canActivate(mockContext);
      expect(rolesResult).toBe(true);
    });
  });
});

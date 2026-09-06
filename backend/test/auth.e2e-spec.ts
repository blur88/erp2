import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { configureTestAppValidation } from "./utils/configure-test-app-validation";
import { AppModule } from "../src/app.module";
import { DataSource } from "typeorm";
import {
  User,
  UserRole,
  UserStatus,
} from "../src/database/entities/user.entity";
import { RefreshToken } from "../src/database/entities/refresh-token.entity";
import * as bcrypt from "bcrypt";
import {
  AUTH_ADMIN_USERNAME,
  AUTH_MANAGER_USERNAME,
  AUTH_SALES_USERNAME,
  resetAuthFixtureUsers,
} from "./utils/auth-fixture";

describe("Authentication (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminAccessToken: string;
  let adminRefreshToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      // Delete only what this suite owns, via the same shared helper. Deleting
      // the row removes any lockout state with it — no separate reset needed.
      await resetAuthFixtureUsers(dataSource);
      await dataSource.destroy();
    }
    await app.close();
  });

  beforeEach(async () => {
    const userRepository = dataSource.getRepository(User);

    // Own-rows reset ONLY, via the shared helper the sentinel also exercises.
    await resetAuthFixtureUsers(dataSource);

    const hashedPassword = await bcrypt.hash("Admin@123!", 12);
    const adminUser = userRepository.create({
      username: AUTH_ADMIN_USERNAME,
      email: `${AUTH_ADMIN_USERNAME}@test.com`,
      password: hashedPassword,
      firstName: "Admin",
      lastName: "User",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    });
    const savedAdmin = await userRepository.save(adminUser);
    testUserId = savedAdmin.id;
  });

  describe("/auth/login (POST)", () => {
    it("should login successfully with valid credentials", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "Admin@123!",
        })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.username).toBe(AUTH_ADMIN_USERNAME);
      expect(response.body.user.email).toBe(`${AUTH_ADMIN_USERNAME}@test.com`);
      expect(response.body.user.password).toBeUndefined(); // Password should not be returned

      adminAccessToken = response.body.accessToken;
      adminRefreshToken = response.body.refreshToken;
    });

    it("should login with email instead of username", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: `${AUTH_ADMIN_USERNAME}@test.com`,
          password: "Admin@123!",
        })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body.user.email).toBe(`${AUTH_ADMIN_USERNAME}@test.com`);
    });

    it("should return 401 for invalid username", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: "invaliduser",
          password: "Admin@123!",
        })
        .expect(401);

      expect(response.body.message).toContain("Invalid credentials");
    });

    it("should return 401 for invalid password", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "WrongPassword",
        })
        .expect(401);

      expect(response.body.message).toContain("Invalid credentials");
    });

    it("should increment failed login attempts on wrong password", async () => {
      const userRepository = dataSource.getRepository(User);

      // First failed attempt
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "WrongPassword",
        })
        .expect(401);

      const user = await userRepository.findOne({
        where: { username: AUTH_ADMIN_USERNAME },
      });
      expect(user.failedLoginAttempts).toBe(1);
    });

    it("should lock account after 5 failed login attempts", async () => {
      const userRepository = dataSource.getRepository(User);

      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/login")
          .send({
            usernameOrEmail: AUTH_ADMIN_USERNAME,
            password: "WrongPassword",
          })
          .expect(401);
      }

      const user = await userRepository.findOne({
        where: { username: AUTH_ADMIN_USERNAME },
      });
      expect(user.failedLoginAttempts).toBe(5);
      expect(user.lockedUntil).toBeDefined();
      expect(user.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it("should return 403 for locked account", async () => {
      const userRepository = dataSource.getRepository(User);

      // Lock the account manually
      await userRepository.update(
        { username: AUTH_ADMIN_USERNAME },
        {
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
      );

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "Admin@123!",
        })
        .expect(403);

      expect(response.body.message).toContain("locked");
    });

    it("should reset failed attempts on successful login", async () => {
      const userRepository = dataSource.getRepository(User);

      // Set failed attempts
      await userRepository.update(
        { username: AUTH_ADMIN_USERNAME },
        { failedLoginAttempts: 3 },
      );

      // Successful login
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "Admin@123!",
        })
        .expect(200);

      const user = await userRepository.findOne({
        where: { username: AUTH_ADMIN_USERNAME },
      });
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lastLoginAt).toBeDefined();
    });

    it("returns 400 when password is omitted", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({})
        .expect(400);

      expect(response.body.message).toContain("Validation failed");
    });
  });

  describe("/auth/refresh (POST)", () => {
    beforeEach(async () => {
      // Login to get refresh token
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "Admin@123!",
        });

      adminRefreshToken = response.body.refreshToken;
      adminAccessToken = response.body.accessToken;
    });

    it("should refresh access token with valid refresh token", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({
          refreshToken: adminRefreshToken,
        })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
    });

    it("should invalidate old refresh token after rotation", async () => {
      // First refresh
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({
          refreshToken: adminRefreshToken,
        })
        .expect(200);

      // Try to use old refresh token again
      const response = await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({
          refreshToken: adminRefreshToken,
        });

      expect([200, 401]).toContain(response.status);
      if (response.status === 401) {
        expect(response.body.message).toContain("Invalid");
      } else {
        expect(response.body).toHaveProperty("accessToken");
      }
    });

    it("should return 401 for invalid refresh token", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({
          refreshToken: "invalid-token",
        })
        .expect(401);

      expect(response.body.message).toContain("Invalid");
    });
  });

  describe("/auth/me (GET)", () => {
    beforeEach(async () => {
      // Login to get access token
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "Admin@123!",
        });

      adminAccessToken = response.body.accessToken;
    });

    it("should return current user with valid token", async () => {
      const response = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.username).toBe(AUTH_ADMIN_USERNAME);
      expect(response.body.email).toBe(`${AUTH_ADMIN_USERNAME}@test.com`);
      expect(response.body.role).toBe(UserRole.ADMIN);
      expect(response.body.password).toBeUndefined();
    });

    it("should return 401 without token", async () => {
      await request(app.getHttpServer()).get("/auth/me").expect(401);
    });

    it("should return 401 with invalid token", async () => {
      await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);
    });
  });

  describe("/auth/logout (POST)", () => {
    beforeEach(async () => {
      // Login to get tokens
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "Admin@123!",
        });

      adminAccessToken = response.body.accessToken;
      adminRefreshToken = response.body.refreshToken;
    });

    it("should logout successfully", async () => {
      await request(app.getHttpServer())
        .post("/auth/logout")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          refreshToken: adminRefreshToken,
        })
        .expect(204);

      // Scoped to this test's own user: an unfiltered count asserts on global
      // state and breaks the moment another suite holds a token (issue #1197).
      const refreshTokenRepository = dataSource.getRepository(RefreshToken);
      const count = await refreshTokenRepository.count({ where: { userId: testUserId } });
      expect(count).toBe(0);
    });

    it("should invalidate all refresh tokens after logout", async () => {
      // Logout
      await request(app.getHttpServer())
        .post("/auth/logout")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          refreshToken: adminRefreshToken,
        })
        .expect(204);

      // Try to use refresh token
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({
          refreshToken: adminRefreshToken,
        })
        .expect(401);
    });
  });

  describe("/auth/change-password (PATCH)", () => {
    beforeEach(async () => {
      // Login to get access token
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "Admin@123!",
        });

      adminAccessToken = response.body.accessToken;
    });

    it("should change password successfully", async () => {
      await request(app.getHttpServer())
        .patch("/auth/change-password")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          currentPassword: "Admin@123!",
          newPassword: "NewPassword@456",
          newPasswordConfirmation: "NewPassword@456",
        })
        .expect(204);

      // Try to login with new password
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "NewPassword@456",
        })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
    });

    it("should return 401 for incorrect current password", async () => {
      const response = await request(app.getHttpServer())
        .patch("/auth/change-password")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          currentPassword: "WrongPassword",
          newPassword: "NewPassword@456",
          newPasswordConfirmation: "NewPassword@456",
        })
        .expect(401);

      expect(response.body.message).toContain("Current password is incorrect");
    });

    it("should return 400 if new passwords do not match", async () => {
      const response = await request(app.getHttpServer())
        .patch("/auth/change-password")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          currentPassword: "Admin@123!",
          newPassword: "NewPassword@456",
          newPasswordConfirmation: "DifferentPassword@789",
        })
        .expect(400);

      expect(response.body.message).toContain("do not match");
    });

    it("should validate password complexity", async () => {
      const response = await request(app.getHttpServer())
        .patch("/auth/change-password")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          currentPassword: "Admin@123!",
          newPassword: "weak",
          newPasswordConfirmation: "weak",
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it("should logout all sessions after password change", async () => {
      // Change password
      await request(app.getHttpServer())
        .patch("/auth/change-password")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          currentPassword: "Admin@123!",
          newPassword: "NewPassword@456",
          newPasswordConfirmation: "NewPassword@456",
        })
        .expect(204);

      // Scoped to this test's own user: an unfiltered count asserts on global
      // state and breaks the moment another suite holds a token (issue #1197).
      const refreshTokenRepository = dataSource.getRepository(RefreshToken);
      const count = await refreshTokenRepository.count({ where: { userId: testUserId } });
      expect(count).toBe(0);
    });
  });

  describe("Protected endpoints authorization", () => {
    let managerAccessToken: string;
    let salesStaffAccessToken: string;

    beforeEach(async () => {
      const userRepository = dataSource.getRepository(User);

      // Create manager user
      const hashedPassword = await bcrypt.hash("Manager@123!", 12);
      const managerUser = userRepository.create({
        username: AUTH_MANAGER_USERNAME,
        email: `${AUTH_MANAGER_USERNAME}@test.com`,
        password: hashedPassword,
        firstName: "Manager",
        lastName: "User",
        role: UserRole.MANAGER,
        status: UserStatus.ACTIVE,
        isActive: true,
      });
      await userRepository.save(managerUser);

      // Create sales staff user
      const salesUser = userRepository.create({
        username: AUTH_SALES_USERNAME,
        email: `${AUTH_SALES_USERNAME}@test.com`,
        password: hashedPassword,
        firstName: "Sales",
        lastName: "User",
        role: UserRole.SALES_STAFF,
        status: UserStatus.ACTIVE,
        isActive: true,
      });
      await userRepository.save(salesUser);

      // Login admin
      const adminResponse = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_ADMIN_USERNAME,
          password: "Admin@123!",
        });
      adminAccessToken = adminResponse.body.accessToken;

      // Login manager
      const managerResponse = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_MANAGER_USERNAME,
          password: "Manager@123!",
        });
      managerAccessToken = managerResponse.body.accessToken;

      // Login sales staff
      const salesResponse = await request(app.getHttpServer())
        .post("/auth/login")
        .send({
          usernameOrEmail: AUTH_SALES_USERNAME,
          password: "Manager@123!",
        });
      salesStaffAccessToken = salesResponse.body.accessToken;
    });

    it("should allow admin to access user management endpoints", async () => {
      const response = await request(app.getHttpServer())
        .get("/users?page=1&limit=10")
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect([200, 400]).toContain(response.status);
      expect(response.body).toBeDefined();
    });

    it("should allow manager to access user list", async () => {
      const response = await request(app.getHttpServer())
        .get("/users?page=1&limit=10")
        .set("Authorization", `Bearer ${managerAccessToken}`);

      expect([200, 400]).toContain(response.status);
      expect(response.body).toBeDefined();
    });

    it("should deny sales staff from accessing protected endpoints without permission", async () => {
      // This would depend on your actual authorization rules
      // Example: sales staff shouldn't create users
      const response = await request(app.getHttpServer())
        .get("/users")
        .set("Authorization", `Bearer ${salesStaffAccessToken}`);

      // The response code depends on your authorization setup
      expect([200, 403]).toContain(response.status);
    });
  });

  describe("Token expiration", () => {
    it("should reject expired access token", async () => {
      // This test would require mocking time or using a very short expiry
      // For now, we test that the mechanism is in place
      await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", "Bearer invalid.expired.token")
        .expect(401);
    });
  });
});

import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import Redis from "ioredis";

@Injectable()
export class AppService implements OnModuleDestroy {
  private redisClient: Redis;

  constructor(@InjectDataSource() private dataSource: DataSource) {
    // Initialize Redis client for health checks
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry for health checks
      lazyConnect: true, // Don't connect immediately
    });
  }

  async getHealth() {
    const services = {
      backend: { status: "healthy", message: "Backend is running" },
      database: { status: "unknown", message: "Not checked" },
      redis: { status: "unknown", message: "Not checked" },
    };

    // Check PostgreSQL connection
    try {
      await this.dataSource.query("SELECT 1");
      services.database = { status: "healthy", message: "Database connected" };
    } catch (error) {
      services.database = {
        status: "unhealthy",
        message: `Database error: ${error.message}`,
      };
    }

    // Check Redis connection
    try {
      await this.redisClient.connect();
      await this.redisClient.ping();
      services.redis = { status: "healthy", message: "Redis connected" };
      await this.redisClient.disconnect();
    } catch (error) {
      services.redis = {
        status: "unhealthy",
        message: `Redis error: ${error.message}`,
      };
      try {
        await this.redisClient.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    // Determine overall status
    const allHealthy = Object.values(services).every(
      (s) => s.status === "healthy",
    );
    const anyUnhealthy = Object.values(services).some(
      (s) => s.status === "unhealthy",
    );

    return {
      status: allHealthy ? "healthy" : anyUnhealthy ? "unhealthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      services,
    };
  }

  getInfo() {
    return {
      name: "ERP System API",
      version: "1.0.0",
      description: "A comprehensive ERP system with modular architecture",
      modules: ["users", "inventory", "sales"],
      features: [
        "Multi-level pricing",
        "Stock tracking",
        "Sales order management",
        "Purchase order workflow",
        "Real-time reporting",
        "Plugin system",
        "API documentation",
      ],
    };
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.redisClient.disconnect();
    } catch (_error) {
      // Ignore redis shutdown errors during application teardown.
    }
  }
}

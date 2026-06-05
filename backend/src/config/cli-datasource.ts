import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { createDatabaseConfig } from "./database-config.factory";

/**
 * CLI DataSource configuration with security validation
 * Used for TypeORM CLI operations like migrations and seeding
 */

// Export DataSource for CLI tools with security validation
// Note: CLI operations now also enforce security validations but allow defaults for development
const config = new ConfigService();

let connectionSource: DataSource;
try {
  connectionSource = new DataSource(createDatabaseConfig(config, true));
} catch (error) {
  console.error("CLI database configuration failed:", error.message);
  // For CLI operations, we need to fail fast if configuration is invalid
  process.exit(1);
}

export default connectionSource;

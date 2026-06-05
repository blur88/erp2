import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger, BadRequestException } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { AppModule } from "./app.module";
import {
  SecurityApplicationService,
  SecurityMonitoringMiddleware,
} from "./common/security";
import { extractValidationMessages } from "./common/utils/validation-errors.util";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  // Serve static files from uploads directory
  app.useStaticAssets(join(__dirname, "..", "uploads"), {
    prefix: "/uploads/",
  });

  // Apply comprehensive security configuration
  const securityService = new SecurityApplicationService(configService);
  securityService.applySecurity(app);

  // Apply security monitoring middleware
  app.use(
    new SecurityMonitoringMiddleware().use.bind(
      new SecurityMonitoringMiddleware(),
    ),
  );

  // Global prefix for all routes
  app.setGlobalPrefix("api");

  // Enhanced Global Validation Pipe with Security Features
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true, // Remove non-whitelisted properties
      forbidNonWhitelisted: false, // Allow unknown query parameters (changed from true)
      skipMissingProperties: true, // Allow optional properties to be missing
      skipNullProperties: false,
      skipUndefinedProperties: false,
      disableErrorMessages: false, // Always show detailed validation errors for debugging
      validationError: {
        target: false, // Don't expose the target object in error messages
        value: false, // Don't expose the invalid value in error messages
      },
      exceptionFactory: (errors) => {
        const messages = extractValidationMessages(errors);
        return new BadRequestException(
          `Validation failed: ${messages.join(", ")}`,
        );
      },
    }),
  );

  // Swagger documentation setup
  if (configService.get("NODE_ENV") !== "production") {
    const config = new DocumentBuilder()
      .setTitle("ERP System API")
      .setDescription(
        "A comprehensive ERP system API with modular architecture",
      )
      .setVersion("1.0")
      .addTag("User Management", "User account management and role control")
      .addTag("Dashboard", "Dashboard and analytics endpoints")
      .addTag("Inventory", "Product and inventory management")
      .addTag("Sales", "Sales orders and customer management")
      .addTag("Purchasing", "Purchase orders and supplier management")
      .addTag("Settings", "Company settings and configuration")
      .addTag("Reports", "Business reports and analytics")
      .addTag("Plugins", "Plugin management system")
      .addTag("Security", "Security monitoring and reporting")
      .addServer("http://localhost:3001", "Development server")
      .addServer("https://api.yourcompany.com", "Production server")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = configService.get("PORT", 3001);
  await app.listen(port);

  logger.log(`🚀 ERP System API is running on: http://localhost:${port}/api`);
  if (configService.get("NODE_ENV") !== "production") {
    logger.log(`📖 API Documentation: http://localhost:${port}/api/docs`);
  }
}

bootstrap();

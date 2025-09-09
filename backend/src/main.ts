import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { SecurityConfigService } from './common/security/security.config';
import { InputSanitizationMiddleware } from './common/security/input-sanitization.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Apply comprehensive security configuration
  const securityConfig = new SecurityConfigService(configService);
  securityConfig.applySecurity(app);

  // Apply input sanitization middleware
  app.use(new InputSanitizationMiddleware().use.bind(new InputSanitizationMiddleware()));

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  // Enhanced Global Validation Pipe with Security Features
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true, // Remove non-whitelisted properties
      forbidNonWhitelisted: true, // Throw error for non-whitelisted properties
      skipMissingProperties: false,
      skipNullProperties: false,
      skipUndefinedProperties: false,
      disableErrorMessages: false, // Always show detailed validation errors for debugging
      validationError: {
        target: false, // Don't expose the target object in error messages
        value: false, // Don't expose the invalid value in error messages
      },
      exceptionFactory: (errors) => {
        // Custom exception factory for debugging
        console.log('Validation errors:', JSON.stringify(errors, null, 2));
        const messages = errors.map(error => {
          const constraints = Object.values(error.constraints || {});
          return constraints.length > 0 ? constraints[0] : `Validation failed for ${error.property}`;
        });
        
        return new Error(`Validation failed: ${messages.join(', ')}`);
      },
    }),
  );


  // Swagger documentation setup
  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ERP System API')
      .setDescription('A comprehensive ERP system API with modular architecture')
      .setVersion('1.0')
      .addTag('User Management', 'User account management and role control')
      .addTag('Dashboard', 'Dashboard and analytics endpoints')
      .addTag('Inventory', 'Product and inventory management')
      .addTag('Sales', 'Sales orders and customer management')
      .addTag('Purchasing', 'Purchase orders and supplier management')
      .addTag('Reports', 'Business reports and analytics')
      .addTag('Plugins', 'Plugin management system')
      .addTag('Security', 'Security monitoring and reporting')
      .addServer('http://localhost:3001', 'Development server')
      .addServer('https://api.yourcompany.com', 'Production server')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = configService.get('PORT', 3001);
  await app.listen(port);

  logger.log(`🚀 ERP System API is running on: http://localhost:${port}/api`);
  if (configService.get('NODE_ENV') !== 'production') {
    logger.log(`📖 API Documentation: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
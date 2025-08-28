import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { CacheModule } from '@nestjs/cache-manager';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { EmailService } from './services/email.service';
import { PasswordValidationService } from './services/password-validation.service';
import { AuditService } from './services/audit.service';
import { SecurityMonitoringService } from './services/security-monitoring.service';
import { User } from '../../database/entities/user.entity';
import { AuditLog } from '../../common/audit/audit-log.entity';

/**
 * Authentication Module
 * Configures JWT authentication, passport strategies, and auth services
 */
@Module({
  imports: [
    // Passport configuration
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false, // Stateless authentication
    }),

    // JWT module with async configuration
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-super-secret-jwt-key'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m'),
          issuer: configService.get<string>('JWT_ISSUER', 'erp-backend'),
          audience: configService.get<string>('JWT_AUDIENCE', 'erp-app'),
          algorithm: 'HS256',
        },
        verifyOptions: {
          issuer: configService.get<string>('JWT_ISSUER', 'erp-backend'),
          audience: configService.get<string>('JWT_AUDIENCE', 'erp-app'),
          algorithms: ['HS256'],
        },
      }),
      inject: [ConfigService],
    }),

    // TypeORM for User and AuditLog entities
    TypeOrmModule.forFeature([User, AuditLog]),

    // Cache module for session management (temporarily disabled for basic testing)
    // CacheModule.register(),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailService, // Re-enabled with disabled constructor
    PasswordValidationService,
    AuditService,
    SecurityMonitoringService,
    JwtStrategy,
    LocalStrategy,
    LocalAuthGuard,
  ],
  exports: [
    AuthService,
    EmailService, // Re-enabled with disabled constructor
    PasswordValidationService,
    AuditService,
    SecurityMonitoringService,
    JwtStrategy,
    LocalStrategy,
    LocalAuthGuard,
    PassportModule,
    JwtModule,
  ],
})
export class AuthModule {}
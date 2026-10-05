import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '@/database/entities/user.entity';
import { RefreshToken } from '@/database/entities/refresh-token.entity';
import { AuthSession } from '@/database/entities/auth-session.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SessionProtocolGuard } from './guards/session-protocol.guard';
import { AuthScheduler } from './auth.scheduler';
import { AuthClock } from './auth-clock';
import { AuthSessionService } from './auth-session.service';
import { ReplayAuditWriter } from './replay-audit.writer';
import { REFRESH_KEYS, loadRefreshKeys } from './tokens/refresh-keys';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, AuthSession]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        return {
          secret: configService.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: configService.get('JWT_ACCESS_TOKEN_EXPIRY', '15m'),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthClock,
    AuthSessionService,
    ReplayAuditWriter,
    {
      provide: REFRESH_KEYS,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        loadRefreshKeys({
          JWT_REFRESH_KEYS: c.get('JWT_REFRESH_KEYS'),
          JWT_REFRESH_ACTIVE_KID: c.get('JWT_REFRESH_ACTIVE_KID'),
          JWT_SECRET: c.get('JWT_SECRET'),
        }),
    },
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    SessionProtocolGuard,
    AuthScheduler,
  ],
  exports: [
    AuthService,
    AuthSessionService,
    AuthClock,
    ReplayAuditWriter,
    REFRESH_KEYS,
    JwtModule,
    JwtAuthGuard,
    RolesGuard,
    SessionProtocolGuard,
  ],
})
export class AuthModule {}

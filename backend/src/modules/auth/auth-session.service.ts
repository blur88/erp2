import { Injectable, Inject, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { User, UserStatus } from '@/database/entities/user.entity';
import { AuthSession } from '@/database/entities/auth-session.entity';
import { RefreshToken } from '@/database/entities/refresh-token.entity';
import { REFRESH_KEYS, type RefreshKeySet } from './tokens/refresh-keys';
import {
  encodeRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from './tokens/refresh-token.codec';
import { AuthClock } from './auth-clock';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  generation: number;
  accessTokenExpiresAt: number; // epoch seconds, the access token's own exp
  expiresIn: number; // seconds, as today
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    @Inject(REFRESH_KEYS) private readonly refreshKeys: RefreshKeySet,
    private readonly clock: AuthClock,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    const override = this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRY');
    if (override !== undefined && override !== null && override !== '') {
      this.parseExpiry(override);
    }
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^([1-9][0-9]*)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid JWT_REFRESH_TOKEN_EXPIRY: '${expiry}'`);
    }
    const val = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return val;
      case 'm':
        return val * 60;
      case 'h':
        return val * 3600;
      case 'd':
        return val * 86400;
      default:
        throw new Error(`Invalid JWT_REFRESH_TOKEN_EXPIRY: '${expiry}'`);
    }
  }

  refreshLifetimeSeconds(rememberMe: boolean): number {
    const override = this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRY');
    if (!override || override.trim() === '') {
      return rememberMe ? 604800 : 172800;
    }
    return this.parseExpiry(override.trim());
  }

  private getAccessTokenExpiry(): number {
    const expiry = this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRY', '15m').trim();
    const match = expiry.match(/^([1-9][0-9]*)([smhd])$/);
    if (!match) {
      return 900;
    }
    const val = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return val;
      case 'm':
        return val * 60;
      case 'h':
        return val * 3600;
      case 'd':
        return val * 86400;
      default:
        return 900;
    }
  }

  private issueAccessToken(
    user: User,
    sessionId: string,
  ): { accessToken: string; accessTokenExpiresAt: number; expiresIn: number } {
    const expiresIn = this.getAccessTokenExpiry();
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      sid: sessionId,
    };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: `${expiresIn}s`,
    });
    const decoded: any = this.jwtService.decode(accessToken);
    return {
      accessToken,
      accessTokenExpiresAt: decoded.exp,
      expiresIn,
    };
  }

  async createSession(
    manager: EntityManager,
    user: User,
    opts: { rememberMe: boolean } & RequestContext,
  ): Promise<IssuedTokens> {
    const rawNow = this.clock.now();
    const now = new Date(Math.floor(rawNow.getTime() / 1000) * 1000);
    const lifetime = this.refreshLifetimeSeconds(opts.rememberMe ?? false);
    const expiresAt = new Date(now.getTime() + lifetime * 1000);

    const sessionRepo = manager.getRepository(AuthSession);
    const session = sessionRepo.create({
      userId: user.id,
      generation: 1,
      expiresAt,
      rememberMe: opts.rememberMe ?? false,
      ipAddress: opts.ipAddress,
      deviceInfo: opts.userAgent,
    });
    const savedSession = await sessionRepo.save(session);

    const nowSec = Math.floor(now.getTime() / 1000);
    const expSec = Math.floor(expiresAt.getTime() / 1000);
    const refreshToken = encodeRefreshToken(
      {
        userId: user.id,
        sessionId: savedSession.id,
        generation: 1,
        issuedAt: nowSec,
        expiresAt: expSec,
        keyId: this.refreshKeys.activeKid,
      },
      this.refreshKeys,
    );

    const tokenHash = hashRefreshToken(refreshToken);
    const tokenRepo = manager.getRepository(RefreshToken);
    const tokenRow = tokenRepo.create({
      tokenHash,
      userId: user.id,
      sessionId: savedSession.id,
      generation: 1,
      issuedAt: now,
      expiresAt,
      keyId: this.refreshKeys.activeKid,
      deviceInfo: opts.userAgent,
      ipAddress: opts.ipAddress,
    });
    await tokenRepo.save(tokenRow);

    const { accessToken, accessTokenExpiresAt, expiresIn } = this.issueAccessToken(
      user,
      savedSession.id,
    );

    return {
      accessToken,
      refreshToken,
      sessionId: savedSession.id,
      generation: 1,
      accessTokenExpiresAt,
      expiresIn,
    };
  }

  async refresh(
    token: unknown,
    ctx: RequestContext,
  ): Promise<{ tokens: IssuedTokens; user: User }> {
    const verifyResult = verifyRefreshToken(token, this.refreshKeys);
    if (verifyResult.ok === false) {
      if (verifyResult.reason === 'key_unavailable') {
        throw new UnauthorizedException({
          message: 'Refresh token key unavailable',
          code: 'REFRESH_KEY_UNAVAILABLE',
        });
      }
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: 'REFRESH_INVALID',
      });
    }

    const { claims } = verifyResult;
    const incomingHash = hashRefreshToken(token as string);

    const tokenRow = await this.refreshTokenRepository.findOne({
      where: { tokenHash: incomingHash },
    });

    if (
      !tokenRow ||
      tokenRow.sessionId !== claims.sessionId ||
      tokenRow.generation !== claims.generation
    ) {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: 'REFRESH_INVALID',
      });
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const session = await manager.getRepository(AuthSession).findOne({
        where: { id: tokenRow.sessionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!session) {
        throw new UnauthorizedException({
          message: 'Invalid refresh token',
          code: 'REFRESH_INVALID',
        });
      }

      const now = this.clock.now();

      if (session.revokedAt !== null) {
        throw new UnauthorizedException({
          message: 'Session has been revoked',
          code: 'SESSION_REVOKED',
        });
      }

      if (tokenRow.expiresAt <= now || session.expiresAt <= now) {
        throw new UnauthorizedException({
          message: 'Refresh token expired',
          code: 'REFRESH_EXPIRED',
        });
      }

      if (tokenRow.generation !== session.generation) {
        throw new UnauthorizedException({
          message: 'Invalid refresh token',
          code: 'REFRESH_INVALID',
        });
      }

      const rawNow = now;
      const nowTrunc = new Date(Math.floor(rawNow.getTime() / 1000) * 1000);
      const lifetime = this.refreshLifetimeSeconds(session.rememberMe);
      const newExpiresAt = new Date(nowTrunc.getTime() + lifetime * 1000);

      session.generation += 1;
      session.expiresAt = newExpiresAt;
      await manager.getRepository(AuthSession).save(session);

      const graceConfig = this.configService.get<string | number>('REFRESH_GRACE_SECONDS', 60);
      const graceSeconds =
        typeof graceConfig === 'number' ? graceConfig : parseInt(graceConfig, 10) || 60;

      tokenRow.supersededAt = nowTrunc;
      tokenRow.graceUntil = new Date(nowTrunc.getTime() + graceSeconds * 1000);
      await manager.getRepository(RefreshToken).save(tokenRow);

      const nowSec = Math.floor(nowTrunc.getTime() / 1000);
      const expSec = Math.floor(newExpiresAt.getTime() / 1000);
      const newRefreshToken = encodeRefreshToken(
        {
          userId: session.userId,
          sessionId: session.id,
          generation: session.generation,
          issuedAt: nowSec,
          expiresAt: expSec,
          keyId: this.refreshKeys.activeKid,
        },
        this.refreshKeys,
      );

      const newTokenHash = hashRefreshToken(newRefreshToken);
      const newTokenRow = manager.getRepository(RefreshToken).create({
        tokenHash: newTokenHash,
        userId: session.userId,
        sessionId: session.id,
        generation: session.generation,
        issuedAt: nowTrunc,
        expiresAt: newExpiresAt,
        keyId: this.refreshKeys.activeKid,
        deviceInfo: ctx.userAgent,
        ipAddress: ctx.ipAddress,
      });
      await manager.getRepository(RefreshToken).save(newTokenRow);

      return {
        sessionId: session.id,
        generation: session.generation,
        refreshToken: newRefreshToken,
        userId: session.userId,
      };
    });

    const user = await this.userRepository.findOne({
      where: { id: result.userId },
    });

    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: 'REFRESH_INVALID',
      });
    }

    if (!user.isActive || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        message: 'User account is not active',
      });
    }

    const { accessToken, accessTokenExpiresAt, expiresIn } = this.issueAccessToken(
      user,
      result.sessionId,
    );

    return {
      tokens: {
        accessToken,
        refreshToken: result.refreshToken,
        sessionId: result.sessionId,
        generation: result.generation,
        accessTokenExpiresAt,
        expiresIn,
      },
      user,
    };
  }
}

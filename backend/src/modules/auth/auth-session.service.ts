import { Injectable, Inject, UnauthorizedException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, IsNull, MoreThan, LessThanOrEqual } from 'typeorm';
import { User, UserStatus } from '@/database/entities/user.entity';
import { AuthSession, SessionRevokeReason } from '@/database/entities/auth-session.entity';
import { RefreshToken } from '@/database/entities/refresh-token.entity';
import { REFRESH_KEYS, type RefreshKeySet } from './tokens/refresh-keys';
import {
  encodeRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from './tokens/refresh-token.codec';
import { AuthClock } from './auth-clock';
import { ReplayAuditWriter } from './replay-audit.writer';

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
export class AuthSessionService implements OnModuleInit {
  private readonly logger = new Logger(AuthSessionService.name);
  private readonly graceSeconds: number;

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
    private readonly replayAuditWriter: ReplayAuditWriter,
  ) {
    const override = this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRY');
    if (override !== undefined && override !== null && override !== '') {
      this.parseExpiry(override);
    }
    this.graceSeconds = this.parseGraceSeconds(
      this.configService.get<string | number>('REFRESH_GRACE_SECONDS'),
    );
  }

  // Defaults only when unset. A malformed, zero, negative or fractional value
  // fails construction (and so startup) instead of silently becoming 60.
  private parseGraceSeconds(raw: unknown): number {
    if (raw === undefined || raw === null) {
      return 60;
    }
    const text = typeof raw === 'number' ? String(raw) : raw;
    if (typeof text !== 'string' || !/^[1-9][0-9]*$/.test(text)) {
      throw new Error(
        `Invalid REFRESH_GRACE_SECONDS: '${String(raw)}' (expected a positive integer number of seconds)`,
      );
    }
    return parseInt(text, 10);
  }

  refreshGraceSeconds(): number {
    return this.graceSeconds;
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
    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      sid: sessionId,
      iat: nowSec,
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

      const presentedRow = await manager.getRepository(RefreshToken).findOne({
        where: { id: tokenRow.id },
      });
      if (!presentedRow) {
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

      if (presentedRow.expiresAt <= now || session.expiresAt <= now) {
        throw new UnauthorizedException({
          message: 'Refresh token expired',
          code: 'REFRESH_EXPIRED',
        });
      }

      // 3. Current-generation rotate
      if (presentedRow.generation === session.generation) {
        const rawNow = now;
        const nowTrunc = new Date(Math.floor(rawNow.getTime() / 1000) * 1000);
        const lifetime = this.refreshLifetimeSeconds(session.rememberMe);
        const newExpiresAt = new Date(nowTrunc.getTime() + lifetime * 1000);

        session.generation += 1;
        session.expiresAt = newExpiresAt;
        await manager.getRepository(AuthSession).save(session);

        const graceSeconds = this.graceSeconds;

        presentedRow.supersededAt = nowTrunc;
        presentedRow.graceUntil = new Date(nowTrunc.getTime() + graceSeconds * 1000);
        await manager.getRepository(RefreshToken).save(presentedRow);

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
          type: 'success' as const,
          sessionId: session.id,
          generation: session.generation,
          refreshToken: newRefreshToken,
          userId: session.userId,
        };
      }

      // 4. Recover: superseded and clock is strictly before its own graceUntil
      if (presentedRow.supersededAt !== null && now < presentedRow.graceUntil) {
        const currentRow = await manager.getRepository(RefreshToken).findOne({
          where: { sessionId: session.id, generation: session.generation },
        });

        if (!currentRow) {
          this.logger.error(`Recovery failed: current token row not found for session ${session.id}`);
          return { type: 'invalid' as const };
        }

        const keySecret = this.refreshKeys.secretFor(currentRow.keyId);
        if (!keySecret) {
          this.logger.error(`Recovery failed: signing key unavailable for session ${session.id}`);
          return { type: 'key_unavailable' as const };
        }

        const issuedAtSec = Math.floor(currentRow.issuedAt.getTime() / 1000);
        const expiresAtSec = Math.floor(currentRow.expiresAt.getTime() / 1000);
        const recoveredToken = encodeRefreshToken(
          {
            userId: currentRow.userId,
            sessionId: currentRow.sessionId,
            generation: currentRow.generation,
            issuedAt: issuedAtSec,
            expiresAt: expiresAtSec,
            keyId: currentRow.keyId,
          },
          this.refreshKeys,
        );

        if (hashRefreshToken(recoveredToken) !== currentRow.tokenHash) {
          this.logger.error(`Recovery failed: token hash mismatch for session ${session.id}`);
          return { type: 'invalid' as const };
        }

        return {
          type: 'success' as const,
          sessionId: session.id,
          generation: session.generation,
          refreshToken: recoveredToken,
          userId: session.userId,
        };
      }

      // 5. Otherwise replay: superseded, unexpired, at or after its graceUntil
      session.revokedAt = now;
      session.revokeReason = 'replay';
      await manager.getRepository(AuthSession).save(session);

      await this.replayAuditWriter.write(manager, {
        sessionId: session.id,
        userId: session.userId,
        presentedGeneration: tokenRow.generation,
        currentGeneration: session.generation,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      return { type: 'replayed' as const };
    });

    if (result.type === 'key_unavailable') {
      throw new UnauthorizedException({
        message: 'Refresh token key unavailable',
        code: 'REFRESH_KEY_UNAVAILABLE',
      });
    }

    if (result.type === 'invalid') {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: 'REFRESH_INVALID',
      });
    }

    if (result.type === 'replayed') {
      throw new UnauthorizedException({
        message: 'Session has been revoked',
        code: 'SESSION_REVOKED',
      });
    }

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

  async logout(token: unknown): Promise<void> {
    if (typeof token !== 'string') {
      return;
    }

    const verifyResult = verifyRefreshToken(token, this.refreshKeys);
    if (!verifyResult.ok) {
      return;
    }

    const { claims } = verifyResult;
    const tokenHash = hashRefreshToken(token);

    const tokenRow = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (
      !tokenRow ||
      tokenRow.sessionId !== claims.sessionId ||
      tokenRow.generation !== claims.generation
    ) {
      return;
    }

    const now = this.clock.now();
    await this.sessionRepository.update(
      { id: tokenRow.sessionId, revokedAt: IsNull() },
      { revokedAt: now, revokeReason: 'logout' },
    );
  }

  async revokeAllForUser(
    manager: EntityManager,
    userId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<number> {
    const res = await manager
      .getRepository(AuthSession)
      .update({ userId, revokedAt: IsNull() }, { revokedAt: now, revokeReason: reason });
    return res.affected ?? 0;
  }

  async isLive(sessionId: string, userId: string, now: Date): Promise<boolean> {
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
    });
    return !!session;
  }

  async cleanupExpired(
    now: Date,
    manager?: EntityManager,
  ): Promise<{ tokens: number; sessions: number }> {
    const tokenRepo = manager
      ? manager.getRepository(RefreshToken)
      : this.refreshTokenRepository;
    const sessionRepo = manager
      ? manager.getRepository(AuthSession)
      : this.sessionRepository;

    const tokenRes = await tokenRepo.delete({ expiresAt: LessThanOrEqual(now) });
    const sessionRes = await sessionRepo.delete({ expiresAt: LessThanOrEqual(now) });

    return {
      tokens: tokenRes.affected ?? 0,
      sessions: sessionRes.affected ?? 0,
    };
  }

  async unconfiguredKeyUsage(): Promise<Array<{ keyId: string; rows: number }>> {
    const configuredKids = this.refreshKeys.kids();
    const qb = this.refreshTokenRepository
      .createQueryBuilder('token')
      .select('token.keyId', 'keyId')
      .addSelect('COUNT(*)::int', 'rows')
      .groupBy('token.keyId');

    if (configuredKids.length > 0) {
      qb.where('token.keyId NOT IN (:...configuredKids)', { configuredKids });
    }

    const results = await qb.getRawMany();
    return results.map((r) => ({
      keyId: r.keyId,
      rows: Number(r.rows),
    }));
  }

  async onModuleInit(): Promise<void> {
    try {
      const unconfigured = await this.unconfiguredKeyUsage();
      for (const entry of unconfigured) {
        this.logger.warn(
          `Unconfigured refresh signing key '${entry.keyId}' in use by ${entry.rows} token(s)`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to check unconfigured refresh key usage: ${err?.message || err}`,
        err?.stack,
      );
    }
  }
}



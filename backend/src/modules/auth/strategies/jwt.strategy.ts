import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '@/database/entities/user.entity';
import { extractAccessToken } from '../tokens/access-token.extractor';
import { AuthSessionService } from '../auth-session.service';
import { AuthClock } from '../auth-clock';

export interface JwtPayload {
  sub: string; // user ID
  sid?: string; // session ID
  username: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private authSessionService: AuthSessionService,
    private clock: AuthClock,
  ) {
    super({
      jwtFromRequest: extractAccessToken,
      algorithms: ['HS256'],
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<any> {
    const { sub: userId, sid: sessionId } = payload;

    if (!sessionId) {
      throw new UnauthorizedException('Invalid token: missing session id');
    }

    const isLive = await this.authSessionService.isLive(
      sessionId,
      userId,
      this.clock.now(),
    );
    if (!isLive) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    // Find user by ID
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is active
    if (!user.isActive || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }

    // Check if account is locked
    if (user.isLocked) {
      throw new UnauthorizedException(
        `Account is locked until ${user.lockedUntil?.toISOString()}`,
      );
    }

    // Return user payload to be attached to request.user
    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      sessionId,
    };
  }
}

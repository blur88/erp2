import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetSessionsDto {
  @ApiProperty({
    description: 'Page number',
    example: 1,
    default: 1,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of sessions per page',
    example: 10,
    default: 10,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;
}

export class SessionResponseDto {
  @ApiProperty({
    description: 'Session ID',
    example: 'uuid-string',
  })
  sessionId: string;

  @ApiProperty({
    description: 'IP address of the session',
    example: '192.168.1.100',
  })
  ipAddress: string;

  @ApiProperty({
    description: 'User agent string',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })
  userAgent?: string;

  @ApiProperty({
    description: 'When the session was created',
    example: '2023-12-01T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last activity timestamp',
    example: '2023-12-01T12:45:00Z',
  })
  lastActivity: Date;

  @ApiProperty({
    description: 'Whether this is the current session',
    example: true,
  })
  isCurrent: boolean;

  @ApiProperty({
    description: 'Whether this is a "remember me" session',
    example: false,
  })
  rememberMe: boolean;

  @ApiProperty({
    description: 'Geographic location (if available)',
    example: 'New York, US',
    required: false,
  })
  location?: string;

  @ApiProperty({
    description: 'Device/browser information',
    example: 'Chrome on Windows',
    required: false,
  })
  device?: string;
}

export class GetSessionsResponseDto {
  @ApiProperty({
    description: 'List of active sessions',
    type: [SessionResponseDto],
  })
  sessions: SessionResponseDto[];

  @ApiProperty({
    description: 'Total number of sessions',
    example: 3,
  })
  total: number;

  @ApiProperty({
    description: 'Current page',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Sessions per page',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total pages',
    example: 1,
  })
  totalPages: number;
}

export class TerminateSessionDto {
  @ApiProperty({
    description: 'Session ID to terminate',
    example: 'uuid-string',
  })
  @IsString()
  sessionId: string;
}

export class TerminateSessionResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Session terminated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'When the session was terminated',
    example: '2023-12-01T13:00:00Z',
  })
  terminatedAt: Date;
}

export class TerminateAllSessionsResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'All other sessions terminated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Number of sessions terminated',
    example: 2,
  })
  sessionsTerminated: number;

  @ApiProperty({
    description: 'When the sessions were terminated',
    example: '2023-12-01T13:00:00Z',
  })
  terminatedAt: Date;
}
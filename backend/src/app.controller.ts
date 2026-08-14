import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './modules/auth/decorators/public.decorator';
import { Auth } from './modules/auth/decorators/auth.decorator';
import { RedisMemoryDetailQueryDto } from './modules/monitoring/dto/redis-memory-detail-query.dto';
import { UserRole } from '@/database/entities/user.entity';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint with infrastructure monitoring' })
  @ApiResponse({
    status: 200,
    description: 'Application health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy', enum: ['healthy', 'degraded', 'unhealthy'] },
        timestamp: { type: 'string', format: 'date-time' },
        uptime: { type: 'number', example: 3600.5 },
        environment: { type: 'string', example: 'development' },
        services: {
          type: 'object',
          properties: {
            backend: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'healthy' },
                message: { type: 'string', example: 'Backend is running' },
              },
            },
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'healthy' },
                message: { type: 'string', example: 'Database connected' },
              },
            },
            redis: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'healthy' },
                message: { type: 'string', example: 'Redis connected' },
                memory: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    usedBytes: { type: 'number', example: 2297720 },
                    maxBytes: { type: 'number', nullable: true, example: 268435456 },
                    utilizationPercent: { type: 'number', nullable: true, example: 1 },
                  },
                },
                // Added backward-compatibly: sampler state summary.
                pressure: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    state: {
                      type: 'string',
                      example: 'healthy',
                      enum: ['insufficient-samples', 'healthy', 'sustained-pressure', 'unknown'],
                    },
                    reason: { type: 'string', nullable: true, example: null },
                    sampleCount: { type: 'number', example: 1440 },
                    validSampleCount: { type: 'number', example: 1440 },
                    latestSampleAt: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async getHealth() {
    return this.appService.getHealth();
  }

  @Get('health/redis-memory')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get Redis memory-pressure history and state' })
  @ApiResponse({ status: 200, description: 'Redis memory-pressure detail' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  async getRedisMemoryDetail(@Query() query: RedisMemoryDetailQueryDto) {
    return this.appService.getRedisMemoryDetail(query);
  }

  @Public()
  @Get('info')
  @ApiOperation({ summary: 'Application information' })
  @ApiResponse({
    status: 200,
    description: 'Application information',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'ERP System API' },
        version: { type: 'string', example: '1.0.0' },
        description: { type: 'string', example: 'A comprehensive ERP system' },
        modules: {
          type: 'array',
          items: { type: 'string' },
          example: ['inventory', 'sales', 'purchasing', 'reports'],
        },
      },
    },
  })
  getInfo() {
    return this.appService.getInfo();
  }
}
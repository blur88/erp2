import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './modules/auth/decorators/public.decorator';

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
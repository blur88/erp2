import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Application is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        uptime: { type: 'number', example: 3600.5 },
        environment: { type: 'string', example: 'development' },
      },
    },
  })
  getHealth() {
    return this.appService.getHealth();
  }

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
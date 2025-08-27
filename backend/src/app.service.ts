import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  getInfo() {
    return {
      name: 'ERP System API',
      version: '1.0.0',
      description: 'A comprehensive ERP system with modular architecture',
      modules: [
        'authentication',
        'dashboard',
        'inventory',
        'sales',
        'purchasing',
        'reports',
        'plugins',
      ],
      features: [
        'Multi-level pricing',
        'Stock tracking',
        'Sales order management',
        'Purchase order workflow',
        'Real-time reporting',
        'Plugin system',
        'API documentation',
      ],
    };
  }
}
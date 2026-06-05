import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Query, 
  UseGuards, 
  Request 
} from '@nestjs/common';
import { 
  DashboardService 
} from '../services/dashboard-service';
import { 
  DashboardDataRequest, 
  UserDashboardLayout 
} from '../interfaces/dashboard-interfaces';
// Auth imports removed - authentication system disabled

@Controller('dashboard')
// Auth guards removed - endpoints now publicly accessible
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('/data')
  // Auth roles removed - endpoint now publicly accessible
  async getDashboardData(
    @Query() request: DashboardDataRequest,
    @Request() req
  ) {
    // User role filtering disabled - authentication removed
    return this.dashboardService.getDashboardData({
      ...request,
      filters: {
        ...request.filters,
        // userRole filtering removed
      }
    });
  }

  @Get('/kpis')
  // Auth roles removed - endpoint now publicly accessible
  async getDashboardKPIs(
    @Query('category') category: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dashboardService.getDashboardData({
      dateRange: {
        start: startDate ? new Date(startDate) : undefined,
        end: endDate ? new Date(endDate) : undefined
      }
    });
  }

  @Get('/alerts')
  // Auth roles removed - endpoint now publicly accessible
  async getDashboardAlerts(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dashboardService.generateAlerts();
  }

  @Post('/layout')
  // Auth roles removed - endpoint now publicly accessible
  async saveUserDashboardLayout(
    @Request() req,
    @Body() layout: UserDashboardLayout
  ) {
    // In a real implementation, you'd save this to a user preferences database
    // This is a placeholder for dashboard layout personalization
    return {
      success: true,
      message: 'Dashboard layout saved',
      layout
    };
  }
}
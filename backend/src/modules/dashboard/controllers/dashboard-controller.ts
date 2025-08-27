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
import { AuthGuard } from '../../auth/guards/auth-guard';
import { RolesGuard } from '../../auth/guards/roles-guard';
import { Roles } from '../../auth/decorators/roles-decorator';
import { UserRole } from '../../auth/interfaces/user-interfaces';

@Controller('dashboard')
@UseGuards(AuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('/data')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EXECUTIVE)
  async getDashboardData(
    @Query() request: DashboardDataRequest,
    @Request() req
  ) {
    // Validate user's access to specific dashboard widgets
    return this.dashboardService.getDashboardData({
      ...request,
      // Add user's role-based filtering
      filters: {
        ...request.filters,
        userRole: req.user.role
      }
    });
  }

  @Get('/kpis')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EXECUTIVE)
  async getDashboardKPIs(
    @Query('category') category: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dashboardService.calculateKPIs(category, {
      start: startDate ? new Date(startDate) : undefined,
      end: endDate ? new Date(endDate) : undefined
    });
  }

  @Get('/alerts')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EXECUTIVE)
  async getDashboardAlerts(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dashboardService.generateAlerts({
      start: startDate ? new Date(startDate) : undefined,
      end: endDate ? new Date(endDate) : undefined
    });
  }

  @Post('/layout')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EXECUTIVE)
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
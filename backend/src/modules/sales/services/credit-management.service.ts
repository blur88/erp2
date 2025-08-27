import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerStatus } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { User, UserRole } from '../../../database/entities/user.entity';
import { CreditCheckResponseDto } from '../dto/customer.dto';

export interface CreditApprovalRequest {
  customerId: string;
  requestedAmount: number;
  requestedCreditLimit: number;
  reason: string;
  requestedByUserId: string;
  businessJustification?: string;
  attachments?: string[];
}

export interface CreditApprovalResponse {
  id: string;
  customerId: string;
  customerName: string;
  currentCreditLimit: number;
  requestedCreditLimit: number;
  requestedAmount: number;
  reason: string;
  businessJustification?: string;
  status: CreditApprovalStatus;
  requestedByUserId: string;
  requestedByUserName: string;
  approvedByUserId?: string;
  approvedByUserName?: string;
  requestedAt: Date;
  approvedAt?: Date;
  comments?: string;
}

export enum CreditApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export interface CreditHold {
  id: string;
  customerId: string;
  amount: number;
  reason: string;
  orderId?: string;
  expiresAt: Date;
  createdByUserId: string;
  releasedAt?: Date;
  releasedByUserId?: string;
}

@Injectable()
export class CreditManagementService {
  private readonly approvalRequests: Map<string, CreditApprovalResponse> = new Map();
  private readonly creditHolds: Map<string, CreditHold> = new Map();

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async checkCredit(customerId: string, amount: number): Promise<CreditCheckResponseDto> {
    const customer = await this.findCustomer(customerId);

    // Check if customer is active and can purchase
    if (!customer.isActive || customer.status === CustomerStatus.SUSPENDED) {
      return {
        approved: false,
        creditLimit: Number(customer.creditLimit),
        currentBalance: Number(customer.currentBalance),
        availableCredit: customer.availableCredit,
        requestedAmount: amount,
        remainingCreditAfterPurchase: 0,
        message: 'Customer account is not active or is suspended',
      };
    }

    // Check against credit limit including any holds
    const totalHolds = this.getActiveCreditHolds(customerId);
    const effectiveAvailableCredit = customer.availableCredit - totalHolds;
    const approved = effectiveAvailableCredit >= amount;

    return {
      approved,
      creditLimit: Number(customer.creditLimit),
      currentBalance: Number(customer.currentBalance),
      availableCredit: customer.availableCredit,
      requestedAmount: amount,
      remainingCreditAfterPurchase: effectiveAvailableCredit - amount,
      message: approved 
        ? 'Credit approved' 
        : `Insufficient credit. Available: ${effectiveAvailableCredit.toFixed(2)}, Requested: ${amount.toFixed(2)}`,
    };
  }

  async requestCreditIncrease(request: CreditApprovalRequest): Promise<CreditApprovalResponse> {
    const customer = await this.findCustomer(request.customerId);
    const requestingUser = await this.findUser(request.requestedByUserId);

    // Validate request
    if (request.requestedCreditLimit <= Number(customer.creditLimit)) {
      throw new BadRequestException('Requested credit limit must be higher than current limit');
    }

    if (request.requestedAmount <= 0) {
      throw new BadRequestException('Requested amount must be positive');
    }

    // Create approval request
    const approvalId = this.generateId();
    const approvalRequest: CreditApprovalResponse = {
      id: approvalId,
      customerId: request.customerId,
      customerName: customer.name,
      currentCreditLimit: Number(customer.creditLimit),
      requestedCreditLimit: request.requestedCreditLimit,
      requestedAmount: request.requestedAmount,
      reason: request.reason,
      businessJustification: request.businessJustification,
      status: CreditApprovalStatus.PENDING,
      requestedByUserId: request.requestedByUserId,
      requestedByUserName: `${requestingUser.firstName} ${requestingUser.lastName}`,
      requestedAt: new Date(),
    };

    this.approvalRequests.set(approvalId, approvalRequest);

    // Auto-approve for small increases or trusted users
    if (this.shouldAutoApprove(customer, request, requestingUser)) {
      return this.approveCreditRequest(approvalId, request.requestedByUserId, 'Auto-approved based on criteria');
    }

    return approvalRequest;
  }

  async approveCreditRequest(
    approvalId: string, 
    approvedByUserId: string, 
    comments?: string,
  ): Promise<CreditApprovalResponse> {
    const request = this.approvalRequests.get(approvalId);
    if (!request) {
      throw new NotFoundException('Credit approval request not found');
    }

    if (request.status !== CreditApprovalStatus.PENDING) {
      throw new BadRequestException('Request has already been processed');
    }

    const approvingUser = await this.findUser(approvedByUserId);
    
    // Check if user has approval authority
    if (!this.canApproveCredit(approvingUser, request.requestedCreditLimit)) {
      throw new UnauthorizedException('User does not have authority to approve this credit limit');
    }

    // Update customer credit limit
    const customer = await this.findCustomer(request.customerId);
    customer.creditLimit = request.requestedCreditLimit;
    await this.customerRepository.save(customer);

    // Update approval request
    request.status = CreditApprovalStatus.APPROVED;
    request.approvedByUserId = approvedByUserId;
    request.approvedByUserName = `${approvingUser.firstName} ${approvingUser.lastName}`;
    request.approvedAt = new Date();
    request.comments = comments;

    this.approvalRequests.set(approvalId, request);

    return request;
  }

  async rejectCreditRequest(
    approvalId: string, 
    rejectedByUserId: string, 
    comments: string,
  ): Promise<CreditApprovalResponse> {
    const request = this.approvalRequests.get(approvalId);
    if (!request) {
      throw new NotFoundException('Credit approval request not found');
    }

    if (request.status !== CreditApprovalStatus.PENDING) {
      throw new BadRequestException('Request has already been processed');
    }

    const rejectingUser = await this.findUser(rejectedByUserId);

    // Update approval request
    request.status = CreditApprovalStatus.REJECTED;
    request.approvedByUserId = rejectedByUserId;
    request.approvedByUserName = `${rejectingUser.firstName} ${rejectingUser.lastName}`;
    request.approvedAt = new Date();
    request.comments = comments;

    this.approvalRequests.set(approvalId, request);

    return request;
  }

  async getPendingApprovals(userId?: string): Promise<CreditApprovalResponse[]> {
    const pendingRequests = Array.from(this.approvalRequests.values())
      .filter(request => request.status === CreditApprovalStatus.PENDING);

    if (userId) {
      const user = await this.findUser(userId);
      // Filter by user's approval authority
      return pendingRequests.filter(request => 
        this.canApproveCredit(user, request.requestedCreditLimit)
      );
    }

    return pendingRequests;
  }

  async getApprovalHistory(customerId?: string): Promise<CreditApprovalResponse[]> {
    let requests = Array.from(this.approvalRequests.values());
    
    if (customerId) {
      requests = requests.filter(request => request.customerId === customerId);
    }

    return requests.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  async placeCreditHold(
    customerId: string, 
    amount: number, 
    reason: string,
    createdByUserId: string,
    orderId?: string,
    expirationHours: number = 24,
  ): Promise<CreditHold> {
    const customer = await this.findCustomer(customerId);
    
    // Check if hold amount is available
    const availableCredit = customer.availableCredit - this.getActiveCreditHolds(customerId);
    if (amount > availableCredit) {
      throw new BadRequestException('Insufficient available credit for hold');
    }

    const holdId = this.generateId();
    const hold: CreditHold = {
      id: holdId,
      customerId,
      amount,
      reason,
      orderId,
      expiresAt: new Date(Date.now() + expirationHours * 60 * 60 * 1000),
      createdByUserId,
    };

    this.creditHolds.set(holdId, hold);
    return hold;
  }

  async releaseCreditHold(holdId: string, releasedByUserId: string): Promise<CreditHold> {
    const hold = this.creditHolds.get(holdId);
    if (!hold) {
      throw new NotFoundException('Credit hold not found');
    }

    if (hold.releasedAt) {
      throw new BadRequestException('Credit hold has already been released');
    }

    hold.releasedAt = new Date();
    hold.releasedByUserId = releasedByUserId;

    this.creditHolds.set(holdId, hold);
    return hold;
  }

  async getActiveCreditHolds(customerId: string): Promise<CreditHold[]> {
    const now = new Date();
    return Array.from(this.creditHolds.values())
      .filter(hold => 
        hold.customerId === customerId &&
        !hold.releasedAt &&
        hold.expiresAt > now
      );
  }

  getActiveCreditHolds(customerId: string): number {
    const now = new Date();
    return Array.from(this.creditHolds.values())
      .filter(hold => 
        hold.customerId === customerId &&
        !hold.releasedAt &&
        hold.expiresAt > now
      )
      .reduce((total, hold) => total + hold.amount, 0);
  }

  async getCreditUtilization(customerId: string): Promise<{
    creditLimit: number;
    currentBalance: number;
    availableCredit: number;
    utilizationPercentage: number;
    activeCreditHolds: number;
    effectiveAvailableCredit: number;
  }> {
    const customer = await this.findCustomer(customerId);
    const activeCreditHolds = this.getActiveCreditHolds(customerId);
    
    const creditLimit = Number(customer.creditLimit);
    const currentBalance = Number(customer.currentBalance);
    const utilizationPercentage = creditLimit > 0 ? (currentBalance / creditLimit) * 100 : 0;

    return {
      creditLimit,
      currentBalance,
      availableCredit: customer.availableCredit,
      utilizationPercentage,
      activeCreditHolds,
      effectiveAvailableCredit: customer.availableCredit - activeCreditHolds,
    };
  }

  async getCreditRisk(customerId: string): Promise<{
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    factors: string[];
    recommendations: string[];
  }> {
    const customer = await this.findCustomer(customerId);
    
    // Get customer's payment history and order statistics
    const [overdueInvoices, totalInvoices, recentOrders] = await Promise.all([
      this.invoiceRepository.count({
        where: { customerId, status: 'overdue' },
      }),
      this.invoiceRepository.count({ where: { customerId } }),
      this.salesOrderRepository.count({
        where: { customerId },
      }),
    ]);

    let riskScore = 0;
    const factors: string[] = [];
    const recommendations: string[] = [];

    // Credit utilization risk
    const utilizationPercentage = customer.availableCredit > 0 
      ? (Number(customer.currentBalance) / Number(customer.creditLimit)) * 100 
      : 0;

    if (utilizationPercentage > 90) {
      riskScore += 30;
      factors.push('High credit utilization (>90%)');
      recommendations.push('Consider increasing credit limit or monitoring payment schedule');
    } else if (utilizationPercentage > 75) {
      riskScore += 20;
      factors.push('Moderate credit utilization (>75%)');
    }

    // Overdue invoice risk
    const overduePercentage = totalInvoices > 0 ? (overdueInvoices / totalInvoices) * 100 : 0;
    if (overduePercentage > 25) {
      riskScore += 40;
      factors.push('High percentage of overdue invoices (>25%)');
      recommendations.push('Review payment terms and follow up on overdue invoices');
    } else if (overduePercentage > 10) {
      riskScore += 20;
      factors.push('Moderate percentage of overdue invoices (>10%)');
    }

    // Account status risk
    if (customer.status === CustomerStatus.SUSPENDED) {
      riskScore += 50;
      factors.push('Account is suspended');
    } else if (!customer.isActive) {
      riskScore += 30;
      factors.push('Account is inactive');
    }

    // Customer longevity (newer customers are riskier)
    const accountAgeMonths = customer.createdAt 
      ? Math.floor((Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 0;
    
    if (accountAgeMonths < 3) {
      riskScore += 20;
      factors.push('New customer (<3 months)');
      recommendations.push('Monitor closely during initial relationship period');
    }

    // Order frequency risk
    if (recentOrders === 0) {
      riskScore += 15;
      factors.push('No recent orders');
    }

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (riskScore >= 80) {
      riskLevel = 'CRITICAL';
      recommendations.push('Consider credit hold or requiring prepayment');
    } else if (riskScore >= 60) {
      riskLevel = 'HIGH';
      recommendations.push('Require management approval for new orders');
    } else if (riskScore >= 30) {
      riskLevel = 'MEDIUM';
      recommendations.push('Monitor payment patterns closely');
    } else {
      riskLevel = 'LOW';
    }

    return {
      riskScore,
      riskLevel,
      factors,
      recommendations,
    };
  }

  // Private helper methods

  private async findCustomer(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  private async findUser(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private shouldAutoApprove(
    customer: Customer, 
    request: CreditApprovalRequest, 
    requestingUser: User,
  ): boolean {
    // Auto-approve for small increases
    const increasePercentage = (request.requestedCreditLimit - Number(customer.creditLimit)) / Number(customer.creditLimit) * 100;
    if (increasePercentage <= 10 && request.requestedCreditLimit <= 5000) {
      return true;
    }

    // Auto-approve for managers with good customer history
    if (requestingUser.role === UserRole.MANAGER) {
      const customerAgeMonths = customer.createdAt 
        ? Math.floor((Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30))
        : 0;
      
      if (customerAgeMonths >= 6 && customer.totalOrders >= 5 && !customer.isOverCreditLimit) {
        return true;
      }
    }

    return false;
  }

  private canApproveCredit(user: User, requestedCreditLimit: number): boolean {
    // Define approval limits by role
    const approvalLimits: Record<UserRole, number> = {
      [UserRole.ADMIN]: Number.MAX_SAFE_INTEGER,
      [UserRole.MANAGER]: 50000,
      [UserRole.SALES_REP]: 10000,
      [UserRole.USER]: 1000,
    };

    const userLimit = approvalLimits[user.role] || 0;
    return requestedCreditLimit <= userLimit;
  }

  private generateId(): string {
    return `CR${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}
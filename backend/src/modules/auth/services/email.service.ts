import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Email Service for authentication-related emails
 * Handles password reset, account verification, and security notifications
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.setupTransporter();
  }

  /**
   * Setup email transporter based on configuration
   */
  private setupTransporter(): void {
    const emailConfig = {
      host: this.configService.get<string>('EMAIL_HOST', 'localhost'),
      port: this.configService.get<number>('EMAIL_PORT', 587),
      secure: this.configService.get<boolean>('EMAIL_SECURE', false),
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
    };

    this.transporter = nodemailer.createTransport(emailConfig);

    // Verify connection on startup
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Email transporter verification failed:', error);
      } else {
        this.logger.log('Email transporter is ready');
      }
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    try {
      const resetUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/auth/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: this.configService.get<string>('EMAIL_FROM', 'noreply@erp-system.com'),
        to: email,
        subject: 'Password Reset Request - ERP System',
        html: this.getPasswordResetTemplate(resetUrl),
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password reset email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send account verification email
   */
  async sendAccountVerificationEmail(email: string, verificationToken: string): Promise<void> {
    try {
      const verificationUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/auth/verify-email?token=${verificationToken}`;
      
      const mailOptions = {
        from: this.configService.get<string>('EMAIL_FROM', 'noreply@erp-system.com'),
        to: email,
        subject: 'Verify Your Account - ERP System',
        html: this.getEmailVerificationTemplate(verificationUrl),
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Account verification email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send security alert email for suspicious activity
   */
  async sendSecurityAlertEmail(email: string, alertType: string, details: string): Promise<void> {
    try {
      const mailOptions = {
        from: this.configService.get<string>('EMAIL_FROM', 'noreply@erp-system.com'),
        to: email,
        subject: `Security Alert - ${alertType}`,
        html: this.getSecurityAlertTemplate(alertType, details),
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Security alert email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send security alert to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send password changed notification
   */
  async sendPasswordChangedNotification(email: string): Promise<void> {
    try {
      const mailOptions = {
        from: this.configService.get<string>('EMAIL_FROM', 'noreply@erp-system.com'),
        to: email,
        subject: 'Password Changed - ERP System',
        html: this.getPasswordChangedTemplate(),
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password changed notification sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password changed notification to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Password reset email template
   */
  private getPasswordResetTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #007bff; 
              color: white; 
              text-decoration: none; 
              border-radius: 4px; 
              margin: 20px 0; 
            }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
            .warning { color: #dc3545; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>You have requested to reset your password for your ERP System account.</p>
              <p>Click the button below to reset your password:</p>
              <p><a href="${resetUrl}" class="button">Reset Password</a></p>
              <p>This link will expire in 1 hour for security reasons.</p>
              <p class="warning">If you did not request this password reset, please ignore this email or contact support immediately.</p>
              <p>For security reasons, never share this link with anyone.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from ERP System. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Email verification template
   */
  private getEmailVerificationTemplate(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Email Verification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #28a745; 
              color: white; 
              text-decoration: none; 
              border-radius: 4px; 
              margin: 20px 0; 
            }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Verify Your Email</h1>
            </div>
            <div class="content">
              <p>Welcome to ERP System!</p>
              <p>To complete your account setup, please verify your email address by clicking the button below:</p>
              <p><a href="${verificationUrl}" class="button">Verify Email</a></p>
              <p>This verification link will expire in 24 hours.</p>
              <p>If you did not create an account, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from ERP System. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Security alert template
   */
  private getSecurityAlertTemplate(alertType: string, details: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Security Alert</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .alert { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Security Alert</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>We detected unusual activity on your ERP System account:</p>
              <div class="alert">
                <strong>Alert Type:</strong> ${alertType}<br>
                <strong>Details:</strong> ${details}<br>
                <strong>Time:</strong> ${new Date().toISOString()}
              </div>
              <p>If this was you, no action is needed. If you don't recognize this activity, please:</p>
              <ul>
                <li>Change your password immediately</li>
                <li>Review your account activity</li>
                <li>Contact support if you need assistance</li>
              </ul>
            </div>
            <div class="footer">
              <p>This is an automated security notification from ERP System.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Password changed notification template
   */
  private getPasswordChangedTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Password Changed</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
            .warning { color: #dc3545; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Changed</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>Your ERP System account password has been successfully changed.</p>
              <p><strong>Time:</strong> ${new Date().toISOString()}</p>
              <p class="warning">If you did not make this change, please contact support immediately and change your password.</p>
              <p>For your security, we recommend:</p>
              <ul>
                <li>Using a strong, unique password</li>
                <li>Enabling two-factor authentication if available</li>
                <li>Not sharing your login credentials</li>
              </ul>
            </div>
            <div class="footer">
              <p>This is an automated security notification from ERP System.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
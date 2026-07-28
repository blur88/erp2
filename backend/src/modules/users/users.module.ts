import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { CacheModule } from '@nestjs/cache-manager';

import { UsersService } from './users.service';
import { UsersSeederService } from './users-seeder.service';
import { UsersController } from './users.controller';
import { User } from '../../database/entities/user.entity';

/**
 * Users Module
 * Handles user management functionality
 */
@Module({
  imports: [
    // TypeORM for User entity
    TypeOrmModule.forFeature([User]),
    
    // Cache module for session management (temporarily disabled for basic testing)
    // CacheModule.register(),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersSeederService],
  exports: [
    UsersService,
    TypeOrmModule, // Export TypeORM module for use in other modules
  ],
})
export class UsersModule {}
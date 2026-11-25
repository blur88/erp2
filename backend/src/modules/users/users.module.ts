import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersService } from './users.service';
import { UsersSeederService } from './users-seeder.service';
import { UsersController } from './users.controller';
import { User } from '../../database/entities/user.entity';

/**
 * Users Module
 * Handles user management functionality
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, UsersSeederService],
  exports: [
    UsersService,
    TypeOrmModule, // Export TypeORM module for use in other modules
  ],
})
export class UsersModule {}
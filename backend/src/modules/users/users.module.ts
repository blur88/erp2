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
    //
    // DO NOT re-enable this against the existing Redis instance. That instance is
    // the BullMQ queue backing store and runs `maxmemory-policy noeviction`
    // (issue #1036), because BullMQ cannot recover from evicted keys. Cache and
    // session workloads generally want eviction; queue state must never be
    // evicted. Landing cache keys on the queue instance therefore either starves
    // the cache or pressures the queue into OOM-failed writes.
    //
    // Re-enabling requires provisioning a SEPARATE Redis service first — never
    // reverting the queue instance to an eviction policy. See the redis service
    // comment in docker-compose.yml.
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
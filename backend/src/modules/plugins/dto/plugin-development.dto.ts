import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsObject, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class PluginExecuteMethodDto {
  @ApiProperty({
    description: 'Method name to execute',
    example: 'processData',
  })
  @IsString()
  method: string;

  @ApiProperty({
    description: 'Method parameters',
    example: { input: 'test data', options: { validate: true } },
    required: false,
  })
  @IsOptional()
  @IsObject()
  params?: any;

  @ApiProperty({
    description: 'Execution timeout in milliseconds',
    default: 30000,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timeout?: number = 30000;

  @ApiProperty({
    description: 'Include execution context in response',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includeContext?: boolean = false;
}

export class PluginDebugDto {
  @ApiProperty({
    description: 'Enable debug logging for plugin',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  enableLogging?: boolean = true;

  @ApiProperty({
    description: 'Log level for debugging',
    enum: ['error', 'warn', 'info', 'debug', 'verbose'],
    default: 'debug',
    required: false,
  })
  @IsOptional()
  @IsString()
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'verbose' = 'debug';

  @ApiProperty({
    description: 'Enable profiling',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enableProfiling?: boolean = false;

  @ApiProperty({
    description: 'Enable memory leak detection',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  detectMemoryLeaks?: boolean = false;

  @ApiProperty({
    description: 'Capture stack traces',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  captureStackTraces?: boolean = true;
}

export class PluginTestDto {
  @ApiProperty({
    description: 'Test suite to run',
    enum: ['unit', 'integration', 'security', 'performance', 'all'],
    default: 'all',
  })
  @IsString()
  testSuite: 'unit' | 'integration' | 'security' | 'performance' | 'all' = 'all';

  @ApiProperty({
    description: 'Test configuration options',
    required: false,
  })
  @IsOptional()
  @IsObject()
  testConfig?: {
    timeout?: number;
    retries?: number;
    parallel?: boolean;
    coverage?: boolean;
  };

  @ApiProperty({
    description: 'Environment variables for testing',
    required: false,
  })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}
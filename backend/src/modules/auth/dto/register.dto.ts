import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, MinLength, MaxLength, Matches, IsEnum, ValidateIf } from 'class-validator';
import { UserRole } from '@/database/entities/user.entity';

export class RegisterDto {
  @ApiProperty({
    description: 'Unique username (3-50 characters, alphanumeric with dots, underscores, hyphens)',
    example: 'john.doe',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(50, { message: 'Username cannot exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username can only contain alphanumeric characters, dots, underscores, and hyphens',
  })
  username: string;

  @ApiProperty({
    description: 'Valid email address',
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    description: 'Strong password (min 8 characters, must include uppercase, lowercase, number, special character)',
    example: 'SecurePass@123',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&.)',
  })
  password: string;

  @ApiProperty({
    description: 'Password confirmation (must match password)',
    example: 'SecurePass@123',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password confirmation is required' })
  passwordConfirmation: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(100)
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(100)
  lastName: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.SALES_STAFF,
    required: false,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(UserRole, { message: 'Invalid user role' })
  role?: UserRole;
}

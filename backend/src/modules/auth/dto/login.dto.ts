import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Username or email address for login',
    example: 'admin',
  })
  @IsString()
  @IsNotEmpty({ message: 'Username or email is required' })
  usernameOrEmail: string;

  @ApiProperty({
    description: 'User password',
    example: 'Admin@123!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @ApiProperty({
    description: 'Remember me - extends refresh token lifetime to 7 days',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

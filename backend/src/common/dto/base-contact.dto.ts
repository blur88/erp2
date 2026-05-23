import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class BaseContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingStreetAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  shippingStreetAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  shippingPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCountry?: string;
}

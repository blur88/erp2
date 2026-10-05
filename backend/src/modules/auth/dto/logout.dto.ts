import { IsOptional } from 'class-validator';

export class LogoutDto {
  @IsOptional()
  refreshToken?: unknown;
}

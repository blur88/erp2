import { ValidationPipe } from '@nestjs/common';
import { createGlobalValidationPipe } from './global-validation-pipe';

describe('createGlobalValidationPipe', () => {
  it('returns a ValidationPipe', () => {
    expect(createGlobalValidationPipe()).toBeInstanceOf(ValidationPipe);
  });

  it('returns a new instance on every call so apps never share pipe state', () => {
    expect(createGlobalValidationPipe()).not.toBe(createGlobalValidationPipe());
  });
});

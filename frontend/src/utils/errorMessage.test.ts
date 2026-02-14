import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errorMessage';

describe('getErrorMessage', () => {
  it('returns plain string errors', () => {
    expect(getErrorMessage('Mapping type already exists', 'Fallback')).toBe(
      'Mapping type already exists',
    );
  });

  it('returns nested API message string', () => {
    const error = {
      response: {
        data: {
          message: 'Account not found',
        },
      },
    };

    expect(getErrorMessage(error, 'Fallback')).toBe('Account not found');
  });

  it('joins nested API message arrays', () => {
    const error = {
      response: {
        data: {
          message: ['mappingType is invalid', 'accountId must be UUID'],
        },
      },
    };

    expect(getErrorMessage(error, 'Fallback')).toBe(
      'mappingType is invalid, accountId must be UUID',
    );
  });

  it('falls back when message is empty', () => {
    expect(getErrorMessage('', 'Fallback message')).toBe('Fallback message');
  });
});

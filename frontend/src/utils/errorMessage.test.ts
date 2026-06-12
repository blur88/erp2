import { describe, expect, it } from 'vitest';
import { getErrorMessage, rtkErrorMessage } from './errorMessage';

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

describe('rtkErrorMessage', () => {
  it('returns the RTK string data (axiosBaseQuery shape)', () => {
    const error = { status: 400, data: 'Order is not in a draft state' };
    expect(rtkErrorMessage(error, 'Fallback')).toBe('Order is not in a draft state');
  });

  it('returns object-shaped data.message when present', () => {
    const error = { status: 400, data: { message: 'Account not found' } };
    expect(rtkErrorMessage(error, 'Fallback')).toBe('Account not found');
  });

  it('falls back to legacy Axios response shape', () => {
    const error = { response: { data: { message: 'Account not found' } } };
    expect(rtkErrorMessage(error, 'Fallback')).toBe('Account not found');
  });

  it('uses the fallback when data is missing', () => {
    expect(rtkErrorMessage({ status: 500 }, 'Failed to update purchase order')).toBe(
      'Failed to update purchase order',
    );
  });

  it('uses the fallback when data is an empty string', () => {
    expect(rtkErrorMessage({ status: 500, data: '' }, 'Fallback message')).toBe(
      'Fallback message',
    );
  });
});

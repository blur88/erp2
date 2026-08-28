import { jest } from '@jest/globals';
import { HttpException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { HttpExceptionFilter } from './http-exception.filter';
import { ErrorClassifierService } from './services/error-classifier.service';
import { ErrorLoggerService } from './services/error-logger.service';
import { ErrorSanitizerService } from './services/error-sanitizer.service';
import { IdGeneratorService } from './services/id-generator.service';

const mockResponse = () => {
  const res: any = {};
  res.status = (jest.fn as unknown as any)().mockReturnValue(res);
  res.json = (jest.fn as unknown as any)().mockReturnValue(res);
  return res;
};

const mockRequest = () => ({
  url: '/api/test',
  method: 'GET',
  ip: '127.0.0.1',
  get: (jest.fn as unknown as any)().mockReturnValue('TestAgent/1.0'),
});

const mockHost = (req: any, res: any) => ({
  switchToHttp: () => ({
    getResponse: () => res,
    getRequest: () => req,
  }),
});

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let errorLogger: any;
  let errorClassifier: ErrorClassifierService;
  let errorSanitizer: ErrorSanitizerService;
  let idGenerator: IdGeneratorService;

  beforeEach(() => {
    const configService = { get: (jest.fn as unknown as any)().mockReturnValue('test') } as any;
    const securityDetector = { isSecurityRelated: (jest.fn as unknown as any)().mockReturnValue(false) } as any;
    errorLogger = {
      logUnexpectedError: (jest.fn as unknown as any)(),
      logSecurityError: (jest.fn as unknown as any)(),
      logApplicationError: (jest.fn as unknown as any)(),
      logDatabaseError: (jest.fn as unknown as any)(),
    } as any;
    errorClassifier = new ErrorClassifierService();
    errorSanitizer = new ErrorSanitizerService();
    idGenerator = new IdGeneratorService();

    filter = new HttpExceptionFilter(
      configService,
      securityDetector,
      errorLogger,
      errorClassifier,
      errorSanitizer,
      idGenerator,
    );
  });

  it('handles HttpException and returns correct status', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    const res = mockResponse();
    const req = mockRequest();

    filter.catch(exception, mockHost(req, res) as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, error: 'HttpException' }));
  });

  it('handles QueryFailedError and returns 400 with DB error code', () => {
    const exception = Object.create(QueryFailedError.prototype);
    exception.message = 'duplicate key value violates unique constraint';
    exception.query = 'INSERT INTO users';
    exception.parameters = [];

    const res = mockResponse();
    const req = mockRequest();

    filter.catch(exception, mockHost(req, res) as any);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('DB_001');
    expect(body.requestId).toBeTruthy();
  });

  it('handles unexpected errors and returns 500', () => {
    const exception = new Error('something broke');
    const res = mockResponse();
    const req = mockRequest();

    filter.catch(exception, mockHost(req, res) as any);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(errorLogger.logUnexpectedError).toHaveBeenCalled();
  });

  it('handles unrecognised QueryFailedError and returns generic message, not raw DB text', () => {
    const exception = Object.create(QueryFailedError.prototype);
    exception.message = 'some obscure storage engine error with internal details';
    exception.query = 'INSERT INTO orders';
    exception.parameters = [];

    const res = mockResponse();
    const req = mockRequest();

    filter.catch(exception, mockHost(req, res) as any);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('DB_999');
    expect(body.message).not.toContain('storage engine');
    expect(body.message).not.toContain('internal details');
    expect(body.message).toMatch(/error occurred|try again/i);
  });

  it('returns production-specific message for unexpected errors when NODE_ENV is production', () => {
    const configService = { get: (jest.fn as unknown as any)().mockReturnValue('production') } as any;
    const securityDetector = { isSecurityRelated: (jest.fn as unknown as any)().mockReturnValue(false) } as any;
    const productionFilter = new HttpExceptionFilter(
      configService,
      securityDetector,
      errorLogger,
      errorClassifier,
      errorSanitizer,
      idGenerator,
    );

    const exception = new Error('something broke');
    const res = mockResponse();
    const req = mockRequest();

    productionFilter.catch(exception, mockHost(req, res) as any);

    const body = res.json.mock.calls[0][0];
    expect(body.message).toContain('contact support');
  });

  it('does not call logApplicationError for QueryFailedError (already logged via logDatabaseError)', () => {
    const exception = Object.create(QueryFailedError.prototype);
    exception.message = 'duplicate key value violates unique constraint';
    exception.query = 'INSERT INTO users';
    exception.parameters = [];

    const res = mockResponse();
    const req = mockRequest();

    filter.catch(exception, mockHost(req, res) as any);

    expect(errorLogger.logDatabaseError).toHaveBeenCalled();
    expect(errorLogger.logApplicationError).not.toHaveBeenCalled();
  });

  it('calls logSecurityError when error is security-related', () => {
    const configService = { get: (jest.fn as unknown as any)().mockReturnValue('test') } as any;
    const securityDetector = { isSecurityRelated: (jest.fn as unknown as any)().mockReturnValue(true) } as any;
    const localFilter = new HttpExceptionFilter(
      configService,
      securityDetector,
      errorLogger,
      errorClassifier,
      errorSanitizer,
      idGenerator,
    );

    const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    const res = mockResponse();
    const req = mockRequest();

    localFilter.catch(exception, mockHost(req, res) as any);

    expect(errorLogger.logSecurityError).toHaveBeenCalled();
  });
});

describe('service error codes in the dedicated `code` field (#985)', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    const configService = { get: (jest.fn as unknown as any)().mockReturnValue('test') } as any;
    const securityDetector = { isSecurityRelated: (jest.fn as unknown as any)().mockReturnValue(false) } as any;
    const errorLogger = {
      logUnexpectedError: (jest.fn as unknown as any)(),
      logSecurityError: (jest.fn as unknown as any)(),
      logApplicationError: (jest.fn as unknown as any)(),
      logDatabaseError: (jest.fn as unknown as any)(),
    } as any;

    filter = new HttpExceptionFilter(
      configService,
      securityDetector,
      errorLogger,
      new ErrorClassifierService(),
      new ErrorSanitizerService(),
      new IdGeneratorService(),
    );
  });

  it('promotes a structured payload `code` and keeps `error` as the exception name', () => {
    const res = mockResponse();
    const req = mockRequest();

    filter.catch(
      new HttpException(
        { message: 'Setup failed. No changes were saved.', code: 'INITIAL_INVENTORY_SETUP_FAILED' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
      mockHost(req, res) as any,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('INITIAL_INVENTORY_SETUP_FAILED');
    expect(body.error).toBe('HttpException');
    expect(body.message).toBe('Setup failed. No changes were saved.');
  });

  it('leaves a plain string-payload HttpException exactly as it behaves today', () => {
    const res = mockResponse();
    const req = mockRequest();

    filter.catch(
      new HttpException('Plain message', HttpStatus.BAD_REQUEST),
      mockHost(req, res) as any,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Plain message');
    expect(body.error).toBe('HttpException');
    expect(body.code).toBeUndefined();
  });

  it('still honours an explicit `error` in a structured payload without inventing a code', () => {
    const res = mockResponse();
    const req = mockRequest();

    filter.catch(
      new HttpException(
        { message: 'Not found', error: 'NotFoundException' },
        HttpStatus.NOT_FOUND,
      ),
      mockHost(req, res) as any,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('NotFoundException');
    expect(body.code).toBeUndefined();
  });
});

import { resolveInstanceId } from './instance-identity';

describe('resolveInstanceId', () => {
  it('prefers MONITORING_INSTANCE_ID over HOSTNAME', () => {
    const result = resolveInstanceId({
      MONITORING_INSTANCE_ID: 'erp_backend',
      HOSTNAME: 'bfd29bedcd22',
    } as NodeJS.ProcessEnv);
    expect(result).toEqual({ instanceId: 'erp_backend', source: 'configured' });
  });

  it('falls back to HOSTNAME when the variable is unset', () => {
    const result = resolveInstanceId({ HOSTNAME: 'bfd29bedcd22' } as NodeJS.ProcessEnv);
    expect(result).toEqual({ instanceId: 'bfd29bedcd22', source: 'hostname' });
  });

  it('generates a uuid when neither is set', () => {
    const result = resolveInstanceId({} as NodeJS.ProcessEnv);
    expect(result.source).toBe('generated');
    expect(result.instanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('ignores an empty or whitespace-only MONITORING_INSTANCE_ID', () => {
    const result = resolveInstanceId({
      MONITORING_INSTANCE_ID: '   ',
      HOSTNAME: 'bfd29bedcd22',
    } as NodeJS.ProcessEnv);
    expect(result).toEqual({ instanceId: 'bfd29bedcd22', source: 'hostname' });
  });

  it('ignores an empty HOSTNAME and generates instead', () => {
    const result = resolveInstanceId({ HOSTNAME: '' } as NodeJS.ProcessEnv);
    expect(result.source).toBe('generated');
  });

  it('trims surrounding whitespace from a configured value', () => {
    const result = resolveInstanceId({
      MONITORING_INSTANCE_ID: ' erp_backend ',
    } as NodeJS.ProcessEnv);
    expect(result.instanceId).toBe('erp_backend');
  });

  it('truncates a value longer than the column width', () => {
    const result = resolveInstanceId({
      MONITORING_INSTANCE_ID: 'x'.repeat(300),
    } as NodeJS.ProcessEnv);
    expect(result.instanceId).toHaveLength(255);
  });
});
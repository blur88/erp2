import { randomUUID } from 'crypto';

export const INSTANCE_ID_MAX_LENGTH = 255;

export type InstanceIdSource = 'configured' | 'hostname' | 'generated';

export interface ResolvedInstanceId {
  instanceId: string;
  source: InstanceIdSource;
}

/**
 * Resolves the identity that scopes sample reads.
 *
 * The value MUST be stable across restarts (it is how a restarted process
 * rejoins its own history) and unique among concurrently running samplers (it
 * is how one writer's series is told from another's). Those pull in opposite
 * directions: a single hard-coded constant satisfies stability and breaks
 * uniqueness as soon as the deployment scales past one backend.
 *
 * `HOSTNAME` is NOT stable in this repo's Docker deployment — the container
 * hostname is the truncated container ID and changes on every recreation, so
 * `MONITORING_INSTANCE_ID` is set explicitly in both compose files.
 */
export function resolveInstanceId(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedInstanceId {
  const configured = env.MONITORING_INSTANCE_ID?.trim();
  if (configured) {
    return { instanceId: clamp(configured), source: 'configured' };
  }

  const hostname = env.HOSTNAME?.trim();
  if (hostname) {
    return { instanceId: clamp(hostname), source: 'hostname' };
  }

  return { instanceId: randomUUID(), source: 'generated' };
}

function clamp(value: string): string {
  return value.slice(0, INSTANCE_ID_MAX_LENGTH);
}
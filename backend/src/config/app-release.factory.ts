/**
 * The release this backend image was built from.
 *
 * The release workflow passes the semantic-release version to the backend image
 * build as APP_VERSION, and the production stage of backend/Dockerfile keeps it
 * at runtime (ADR-0002). Anything other than a plain X.Y.Z version is reported
 * as `unreleased`.
 */
export const UNRELEASED_VERSION = 'unreleased';

export type AppReleaseStatus =
  /** A valid X.Y.Z APP_VERSION is present. */
  | 'released'
  /** No valid version, outside production: a local or development build. */
  | 'development'
  /** No valid version in production: a deployment configuration error. */
  | 'misconfigured';

export interface AppRelease {
  version: string;
  status: AppReleaseStatus;
  /** Set only for `misconfigured`; the message to log at startup. */
  configurationError: string | null;
}

const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Resolves the release version from the environment.
 *
 * Pure and env-injected, like createScheduleOptions(). The comparison on
 * NODE_ENV is strict: only exactly 'production' turns a missing or invalid
 * version into a configuration error. It never throws, so an image built
 * without a version still serves business traffic.
 */
export const resolveAppRelease = (
  env: { NODE_ENV?: string; APP_VERSION?: string } = process.env,
): AppRelease => {
  const appVersion = env.APP_VERSION ?? '';

  if (RELEASE_VERSION_PATTERN.test(appVersion)) {
    return { version: appVersion, status: 'released', configurationError: null };
  }

  if (env.NODE_ENV === 'production') {
    return {
      version: UNRELEASED_VERSION,
      status: 'misconfigured',
      configurationError:
        `Configuration error: APP_VERSION must be a release version X.Y.Z in production, ` +
        `but it is ${JSON.stringify(appVersion)}. The backend reports its version as ` +
        `"${UNRELEASED_VERSION}" until the image is rebuilt from a release.`,
    };
  }

  return { version: UNRELEASED_VERSION, status: 'development', configurationError: null };
};

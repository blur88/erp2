/** Resolve the version embedded in the frontend at build time. */
export function resolveAppVersion(env: {
  VITE_APP_VERSION?: string
  npm_package_version?: string
}): string {
  return env.VITE_APP_VERSION || env.npm_package_version || '0.0.0-development'
}

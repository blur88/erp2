/** Shared token accessor for request authorization and refresh (#1547). */
export function getCredentials(state: {
  auth?: { accessToken?: string | null; refreshToken?: string | null }
}) {
  return {
    accessToken: state.auth?.accessToken,
    refreshToken: state.auth?.refreshToken,
  }
}

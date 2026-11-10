#!/bin/sh

# Generate runtime configuration on the Compose /var/run tmpfs.
# This allows runtime configuration of the React app

# Create environment configuration that gets injected into HTML
if ! cat > /var/run/env-config.js << ENVEOF
window.__ENV__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL:-/api}",
  SESSION_IDLE_TIMEOUT_MS: ${SESSION_IDLE_TIMEOUT_MS:-43200000}
};
ENVEOF
then
  echo "Failed to generate runtime configuration at /var/run/env-config.js" >&2
  exit 1
fi

# Execute the main command
exec "$@"

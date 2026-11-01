#!/bin/sh

# Replace environment variables in built files
# This allows runtime configuration of the React app

# Create environment configuration that gets injected into HTML
cat > /usr/share/nginx/html/env-config.js << ENVEOF
window.__ENV__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL}",
  SESSION_IDLE_TIMEOUT_MS: ${SESSION_IDLE_TIMEOUT_MS:-43200000}
};
ENVEOF

# Execute the main command
exec "$@"

#!/bin/sh

# Replace environment variables in built files
# This allows runtime configuration of the React app

# Create environment configuration that gets injected into HTML
cat > /usr/share/nginx/html/env-config.js << ENVEOF
window.__ENV__ = {
  VITE_API_BASE_URL: "${VITE_API_BASE_URL}",
  VITE_SOCKET_URL: "${VITE_SOCKET_URL}"
};
ENVEOF

# Execute the main command
exec "$@"

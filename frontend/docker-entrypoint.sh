#!/bin/sh

# Replace environment variables in built files
# This allows runtime configuration of the React app

if [ -n "$REACT_APP_API_BASE_URL" ]; then
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|REACT_APP_API_BASE_URL_PLACEHOLDER|$REACT_APP_API_BASE_URL|g" {} \;
fi

if [ -n "$REACT_APP_SOCKET_URL" ]; then
    find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|REACT_APP_SOCKET_URL_PLACEHOLDER|$REACT_APP_SOCKET_URL|g" {} \;
fi

# Execute the main command
exec "$@"
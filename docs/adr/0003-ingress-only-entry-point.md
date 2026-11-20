# Ingress nginx is the only entry point; frontend nginx only serves static files

In development and production Compose deployments, all browser and API traffic should enter through the Ingress. Keep the two containers. The Ingress owns request routing and rate limits. It sends API, upload and Socket.IO traffic to the backend and web app requests to the Frontend server. The Frontend server keeps its startup generation of `env-config.js` and serves the built assets, including the `index.html` fallback for client-side routes.

The Ingress owns shared security headers, the Frontend server owns cache headers for the files it serves, and the backend owns caching for API responses and uploads. TLS termination is outside the scope of this decision and is tracked separately in [#1960](https://github.com/blur88/erp2/issues/1960).

The existing Frontend server also proxies backend requests. Publishing its port lets callers use those routes without passing through the Ingress rate limits. Implementing this decision requires removing those proxy locations and the frontend and backend host port mappings from both Compose files. The Ingress can reach both services over the Compose network. Docker development instructions should direct users to `http://localhost` and `http://localhost/api`.

## Alternatives considered

- Serving the app from the Ingress would remove a container, but every frontend change would require rebuilding the Ingress image and the runtime configuration entrypoint would move into it.
- Making the Frontend server the Ingress would also remove a container and preserve that entrypoint. It would make the frontend image responsible for API routing, rate limits and security headers. Keeping both lets the web app and ingress policy change independently.

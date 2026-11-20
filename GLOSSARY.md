# ERP

An ERP system for inventory, sales and purchasing, shipped as container images and run from a prebuilt production stack.

## Release & distribution

**Release**:
A versioned, published cut of `main`, named `vX.Y.Z`, identical across the GitHub release, its git tag and its images.
_Avoid_: Build, deploy, version bump

**Release repository**:
The Docker Hub repository `blur88/erp2`: every Release's images by version plus the latest ones, and the source production runs from.
_Avoid_: erp2 repo, prod repo

**Master repository**:
The Docker Hub repository `blur88/master`: the owner's private image store, shared across their projects; not used by production.
_Avoid_: Main repo, `blur88/all`

## Deployment

**Ingress**:
The NGINX server built from `nginx/` and the only service Compose publishes on the host (port 80). It holds the rate limits and the security-header policy, so every request to the API, uploads or socket.io passes through it and its limits.
_Avoid_: Reverse proxy, gateway, load balancer

**Frontend server**:
The NGINX server built from `frontend/`. It serves the built web app and its caching headers, and is reachable only through the Ingress.
_Avoid_: Frontend container, web server, static server

**Entry point**:
A host port through which a caller can reach the app. There is exactly one, the Ingress. A published port on the Frontend server or backend would be a second one that skips the Ingress's limits.
_Avoid_: Endpoint, access port

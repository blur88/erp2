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

**Breaking release**:
A Release that production installs on the immediately preceding Release can't take without new operator action. It is always a major version. A break that already shipped doesn't make later Releases breaking. One published by mistake as a minor is still a Breaking release, and is documented as a misclassification.
_Avoid_: Breaking update, incompatible version, release classification

**Release preview**:
The Release a PR's merge result is predicted to produce: its version, release type and release-note headings. It is a prediction, not a Release.
_Avoid_: Dry run, release impact, release classification

**Release boundary**:
A ticket's constraint on whether its PR may merge, or ship, on its own.
_Avoid_: Integration boundary, merge boundary

**Maintainer exception**:
A recorded maintainer decision that lets one PR cross its Release boundary. It records the operational consequences the maintainer accepted, but it never waives a required check or changes what kind of Release the merge produces.
_Avoid_: Override, waiver

## Deployment

**Ingress**:
The NGINX server built from `nginx/` and the only service Compose publishes on the host. In development it serves the app on port 80. In production it serves the app on 443, and port 80 only answers ACME challenges and redirects everything else to HTTPS. It holds the rate limits and the security-header policy, so every request to the API, uploads or socket.io passes through it and its limits.
_Avoid_: Reverse proxy, gateway, load balancer

**Frontend server**:
The NGINX server built from `frontend/`. It serves the built web app and its caching headers, and is reachable only through the Ingress.
_Avoid_: Frontend container, web server, static server

**Entry point**:
A host port through which a caller can reach the app. The Ingress is the only one: port 80 in development, and 443 in production, with port 80 there only answering ACME challenges and redirecting to HTTPS. A published port on the Frontend server or backend would be a second one that skips the Ingress's limits.
_Avoid_: Endpoint, access port

**Canonical hostname**:
The single configured hostname that serves the production app. HTTPS requests for any other hostname that reach the HTTP layer get 421.
_Avoid_: Domain, server name, public URL

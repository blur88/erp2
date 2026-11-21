FROM nginx:1.30.0-alpine3.23-slim
COPY nginx.conf nginx-https.conf http-common.conf health-server.conf app-server.conf \
    app-locations.conf rate-limits.conf security-headers.conf hsts.conf /etc/nginx/
COPY production-templates/servers.conf.template /etc/nginx/production-templates/
COPY --chmod=755 05-validate-public-host.sh /docker-entrypoint.d/

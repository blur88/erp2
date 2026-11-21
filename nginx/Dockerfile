FROM nginx:1.30.0-alpine3.23-slim
COPY *.conf /etc/nginx/
COPY production-templates/ /etc/nginx/production-templates/
COPY --chmod=755 05-validate-public-host.sh /docker-entrypoint.d/

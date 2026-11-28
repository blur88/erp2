# Stage 1: Install all dependencies (dev + prod) for building
FROM node:26.13.1-alpine3.24 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Stage 2: Build the application
FROM node:26.13.1-alpine3.24 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# verify:dist runs AFTER the cli compile, because that second pass is what can
# overwrite nest build's alias-rewritten output with unresolvable aliases. It
# fails the image build rather than shipping a dist/ that cannot boot.
RUN npm run build && \
    npx tsc -p tsconfig.cli.json && \
    npm run verify:dist && \
    npm prune --omit=dev && npm cache clean --force

# Stage 3: PostgreSQL client tools, taken from the same official image the
# database runs (#2110). Alpine 3.24 packages stop at PostgreSQL 18, so the
# backup client must come from this stage. The reference is literal and must
# match docker-compose.yml; the image alignment test enforces that.
FROM postgres:19.0-alpine3.24 AS pgclient

# Stage 4: Production image — only compiled output + prod deps
FROM node:26.13.1-alpine3.24 AS production

# Release version from the release workflow (ADR-0002). Empty when built without
# it; the app then reports "unreleased" (src/config/app-release.factory.ts).
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

# Install security updates and runtime dependencies. The PostgreSQL client
# needs the shared libraries listed here (krb5-libs, libldap, lz4-libs,
# zstd-libs, libedit); age encrypts Backups.
RUN apk upgrade --no-cache && \
    apk add --no-cache curl dumb-init age krb5-libs libldap lz4-libs zstd-libs libedit && \
    rm -rf /usr/local/lib/node_modules/npm && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

# PostgreSQL client tools and the libpq they link against (#2110)
COPY --from=pgclient /usr/local/bin/pg_dump /usr/local/bin/pg_dumpall /usr/local/bin/pg_restore /usr/local/bin/psql /usr/local/bin/
COPY --from=pgclient /usr/local/lib/libpq.so.5* /usr/local/lib/

# Copy only built output and production node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Copy entrypoint script
COPY --chown=nestjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Create necessary directories with proper permissions
RUN mkdir -p uploads logs && \
    chown -R nestjs:nodejs uploads logs

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Run migrations then start application
CMD ["./docker-entrypoint.sh"]

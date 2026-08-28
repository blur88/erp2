# Stage 1: Install all dependencies (dev + prod) for building
FROM node:24.16.0-alpine3.23 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Stage 2: Build the application
FROM node:24.16.0-alpine3.23 AS builder
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

# Stage 3: Production image — only compiled output + prod deps
FROM node:24.16.0-alpine3.23 AS production

# Install security updates and runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache curl postgresql18-client dumb-init && \
    rm -rf /var/cache/apk/* && \
    rm -rf /usr/local/lib/node_modules/npm && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

# Copy only built output and production node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Copy entrypoint script
COPY --chown=nestjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Create necessary directories with proper permissions
RUN mkdir -p uploads logs backups/{postgresql,redis,settings,archives,temp,uploads} && \
    chown -R nestjs:nodejs uploads logs backups

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

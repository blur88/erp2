# Production-ready Dockerfile for NestJS Backend
FROM node:24-alpine

# Install security updates and runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache curl postgresql-client mongodb-tools dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY --chown=nestjs:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p uploads logs backups/{postgresql,mongodb,redis,settings,archives,temp,uploads} && \
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

# Start with ts-node (transpile-only for performance)
CMD ["npx", "ts-node", "-r", "tsconfig-paths/register", "--transpile-only", "src/main.ts"]

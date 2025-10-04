# Single stage for development deployment
FROM node:22-alpine

# Install security updates
RUN apk update && apk upgrade

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm install && npm cache clean --force

# Copy source code
COPY --chown=nestjs:nodejs . .

# Create necessary directories
RUN mkdir -p uploads logs dist

# Note: Running as root for development - not recommended for production

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Install missing dependencies with legacy peer deps to resolve conflicts
RUN npm install @nestjs/microservices class-transformer --legacy-peer-deps || true

# Alternative: start with node and transpile-only option to bypass webpack
CMD ["npx", "ts-node", "-r", "tsconfig-paths/register", "--transpile-only", "src/main.ts"]
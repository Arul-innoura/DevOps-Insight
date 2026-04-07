# Optimized multi-stage Dockerfile for faster builds
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies with clean cache
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copy source files
COPY public ./public
COPY src ./src

# Build arguments
ARG REACT_APP_API_URL=/api
ARG REACT_APP_ENABLE_SSE=false
ARG REACT_APP_USE_WEBSOCKET=true

# Environment variables for build
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_ENABLE_SSE=$REACT_APP_ENABLE_SSE
ENV REACT_APP_USE_WEBSOCKET=$REACT_APP_USE_WEBSOCKET
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV GENERATE_SOURCEMAP=false

# Build with production optimizations
RUN npm run build

# Production stage with optimized nginx
FROM nginx:1.27-alpine AS production
WORKDIR /usr/share/nginx/html

# Remove default nginx static files
RUN rm -rf ./*

# Healthcheck dependency (nginx:alpine does not always ship wget)
RUN apk add --no-cache curl

# Copy built assets
COPY --from=build /app/build .

# Forwarded headers map must load in http{} before server blocks reference variables
COPY nginx-00-forwarded.conf /etc/nginx/conf.d/00-forwarded.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add gzip and cache control config
RUN echo 'gzip on; \
gzip_vary on; \
gzip_min_length 1024; \
gzip_proxied any; \
gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml; \
gzip_comp_level 6;' > /etc/nginx/conf.d/gzip.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:80/index.html >/dev/null || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

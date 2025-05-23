FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for production build
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Copy environment variables for production build
COPY .env.production .env.production

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy environment file
COPY --from=builder /app/.env.production ./.env.production

USER nextjs

EXPOSE 3002

ENV PORT 3002
ENV HOSTNAME "0.0.0.0"

# Start the application
CMD ["node", "server.js"] 
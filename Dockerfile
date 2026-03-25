FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY tsconfig.json knexfile.ts docker-entrypoint.sh ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

CMD ["./docker-entrypoint.sh"]

FROM node:20-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install Playwright Chromium + system dependencies
RUN npx -y playwright@1.52.0 install --with-deps chromium

# Mirror the local directory structure: /app/web/ is the server root
# so projectRoot = path.resolve(__dirname, '..') = /app
WORKDIR /app/web

# Install Node dependencies
COPY web/package.json web/package-lock.json* ./
RUN npm ci --production

# Copy application code
COPY web/*.js ./
COPY web/public/ ./public/

# Copy supporting files at the project root level
COPY schema/ /app/schema/
COPY instances/alibaba-b2b/ /app/instances/alibaba-b2b/

# Outputs directory (ephemeral, created at runtime)
RUN mkdir -p /app/outputs /app/instances

EXPOSE 3000
CMD ["node", "server.js"]

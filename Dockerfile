FROM node:22-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  wget \
  --no-install-recommends && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

# Set Chromium path environment variable
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy files
COPY . .

# Install dependencies (no chromium download)
RUN npm install --omit=dev

# Expose port
EXPOSE 10000

# Start app
CMD ["npm", "start"]

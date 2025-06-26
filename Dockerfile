# Use official Node.js image with Debian slim
FROM node:20-slim

# Install necessary system dependencies for Chromium (required by Puppeteer)
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package definition files first (for caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the full app source code
COPY . .

# Expose the web server port (adjust if needed)
EXPOSE 10000

# Default command to run app
CMD ["npm", "start"]

# Use lightweight Node image
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Install dependencies required for running Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome stable
RUN wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies (omit dev for smaller build)
RUN npm install --omit=dev

# Copy the rest of the app
COPY . .

# Expose app port
EXPOSE 3000

# Set Puppeteer to use system Chrome
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Disable sandbox flags for container
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"

# Launch app
CMD ["node", "index.js"]

# ImageBridge — AI image generation REST API (ChatGPT & Gemini) in a container.
#
#   docker build -t imagebridge .
#   docker compose up -d --build        # preferred, see docker-compose.yml
#
# The browser profile directories are mounted in from the host rather than baked
# in: sign-in has to happen once by hand wherever the container will read it,
# and a headless container has no display to sign in with. See the Docker
# section of the README.

FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HEADLESS=true \
    PORT=3001

WORKDIR /app

# Dependencies first, so editing a source file does not re-download Chromium.
# The dev dependencies are not optional here: tsx is what runs the TypeScript
# at runtime, so this is npm ci and not npm ci --omit=dev.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Chromium plus every shared library it needs. --with-deps is the apt half,
# which is why this needs root and why the apt lists are dropped afterwards.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Playwright's Chromium is not Google Chrome, and channel 'chrome' needs the
# latter, so the container runs the bundled browser unless a caller overrides
# this and installs Chrome itself.
ENV USE_REAL_CHROME=false

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

# Not `npm start`: that is the watch mode meant for a development machine.
CMD ["npm", "run", "start:prod"]

# Build OpenClaw from source
FROM node:22-bookworm AS openclaw-build

# Install build dependencies
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# Install Bun (used by OpenClaw build)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /openclaw

# Pin to stable version (avoid main branch build errors)
ARG OPENCLAW_GIT_REF=v2026.1.30
RUN git clone --depth 1 --branch "${OPENCLAW_GIT_REF}" https://github.com/openclaw/openclaw.git .

# Patch: relax version requirements for unpublished packages
RUN set -eux; \
  find ./extensions -name 'package.json' -type f | while read -r f; do \
    sed -i -E 's/"openclaw"[[:space:]]*:[[:space:]]*">=[^"]+"/"openclaw": "*"/g' "$f"; \
    sed -i -E 's/"openclaw"[[:space:]]*:[[:space:]]*"workspace:[^"]+"/"openclaw": "*"/g' "$f"; \
  done

RUN pnpm install --no-frozen-lockfile
RUN pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:install && pnpm ui:build


# Runtime image
FROM node:22-bookworm
ENV NODE_ENV=production

# Install runtime dependencies
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for custom skills
RUN pip3 install --no-cache-dir --break-system-packages requests

WORKDIR /app

# Copy wrapper dependencies and install
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built OpenClaw from build stage
COPY --from=openclaw-build /openclaw /openclaw

# Provide openclaw executable
RUN printf '%s\n' '#!/usr/bin/env bash' 'exec node /openclaw/dist/index.js "$@"' > /usr/local/bin/openclaw \
  && chmod +x /usr/local/bin/openclaw

# Copy wrapper server
COPY src ./src

# Copy customizations (config + skills)
COPY ./customizations/ /app/customizations/

# Create OpenClaw config directories and copy config
RUN mkdir -p /root/.openclaw /home/node/.openclaw && \
    cp /app/customizations/config/openclaw.json /root/.openclaw/openclaw.json && \
    cp /app/customizations/config/openclaw.json /home/node/.openclaw/openclaw.json

# Create symlinks for skills
RUN ln -sf /app/customizations/skills /app/skills

# Ensure skill handlers are executable
RUN chmod +x /app/customizations/skills/*/handler.py || true

# Environment variables
ENV OPENCLAW_PUBLIC_PORT=8080
ENV PORT=8080
EXPOSE 8080

# Start wrapper server (which will start OpenClaw internally)
CMD ["node", "src/server.js"]

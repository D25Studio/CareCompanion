# Voice agent worker. Build from the repository root so the workspace is available:
#   docker build -f services/voice-agent/Dockerfile -t care-voice-agent .
FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY services/voice-agent/package.json services/voice-agent/

RUN pnpm install --frozen-lockfile --filter @care/voice-agent... --prod=false

COPY packages/shared packages/shared
COPY services/voice-agent services/voice-agent

WORKDIR /app/services/voice-agent

# LiveKit Cloud agent deploys and most PaaS expect the worker to listen for health checks.
EXPOSE 8081

CMD ["pnpm", "start"]

FROM oven/bun:1.3.0

WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/discord-bot/package.json apps/discord-bot/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/
RUN bun install --frozen-lockfile --ignore-scripts --filter @pitch/discord-bot
COPY apps/discord-bot apps/discord-bot

USER bun
CMD ["bun", "--cwd", "apps/discord-bot", "start"]

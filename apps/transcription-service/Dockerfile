FROM oven/bun:1-debian

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY src ./src

# Pre-download the Whisper model into the Docker image cache
RUN bun run src/download.ts

ENV PORT=4000
EXPOSE 4000

CMD ["bun", "run", "src/index.ts"]
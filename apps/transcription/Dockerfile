FROM oven/bun:1-debian

WORKDIR /app

# Build context is the repo root (see docker-compose.yml), so COPY from the
# app subdirectory — same convention as the api/worker Dockerfiles.
COPY apps/transcription/package.json .
RUN bun install --production

ENV HF_CACHE_DIR=/app/.cache
ENV WHISPER_MODEL=Xenova/whisper-small
ENV WHISPER_DTYPE=q8

COPY apps/transcription/src ./src

# Bake the Whisper model into the image so cold starts don't download it.
RUN bun src/preload.ts

EXPOSE 4000
CMD ["bun", "src/index.ts"]

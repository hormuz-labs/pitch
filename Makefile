.DEFAULT_GOAL := help

# ─── Colours ──────────────────────────────────────────────────────────────────
BOLD  := \033[1m
CYAN  := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

# ─── Helpers ──────────────────────────────────────────────────────────────────
.PHONY: help dev start dev-docker discord prod down logs ps test test-watch unittest integration sandbox-check whisper-model

help:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Pitch — available targets$(RESET)"
	@echo ""
	@echo "  $(GREEN)make dev$(RESET)        — start everything at once (backing services in Docker + API and web via Bun)"
	@echo "  $(GREEN)make start$(RESET)      — alias for make dev"
	@echo "  $(GREEN)make dev-docker$(RESET) — run the full stack inside Docker Compose"
	@echo "  $(GREEN)make discord$(RESET)    — start the Discord bot after its credentials are configured"
	@echo "  $(GREEN)make prod$(RESET)       — start all containers in production mode"
	@echo "  $(GREEN)make down$(RESET)       — stop all containers and free dev ports"
	@echo "  $(GREEN)make logs$(RESET)       — tail logs for the API container"
	@echo "  $(GREEN)make ps$(RESET)         — list container status"
	@echo "  $(GREEN)make unittest$(RESET)   — run fast pure unit tests (no browser)"
	@echo "  $(GREEN)make integration$(RESET)— run browser-driven integration tests (playwright-cli)"
	@echo "  $(GREEN)make test$(RESET)       — alias for unittest"
	@echo "  $(GREEN)make test-watch$(RESET) — run unit tests in watch mode (vitest)"
	@echo "  $(GREEN)make sandbox-check$(RESET)— verify the agent's shell is confined on this host"
	@echo "  $(GREEN)make whisper-model$(RESET)— fetch the model motion_align needs"
	@echo ""
	@echo "  $(YELLOW)Architecture note:$(RESET) There is no standalone worker or queue service."
	@echo "  The agent sessions, FFmpeg rendering, and studio previews run unified inside the API."
	@echo ""

# ─── Development ──────────────────────────────────────────────────────────────
# Starts everything at once:
# 1. Frees ports 3000, 5173, 5174 from any stale processes
# 2. Ensures Postgres, MinIO, and CloakBrowser are running in Docker
# 3. Ensures dependencies are installed and runs database migrations
# 4. Boots both backend (API/agent on :3000) and frontend (Vite on :5173) with Bun
dev:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Starting Pitch development stack...$(RESET)"
	@echo ""
	@echo "  $(YELLOW)Freeing ports 3000, 5173, 5174...$(RESET)"
	@for p in 3000 5173 5174; do \
		pid=$$(lsof -ti :$$p 2>/dev/null) && kill -9 $$pid 2>/dev/null && echo "  killed process on port $$p" || true; \
	done
	@echo ""
	@echo "  $(GREEN)Starting Docker dependencies (postgres, minio, cloakbrowser)...$(RESET)"
	@docker compose -p pitch up -d --wait postgres minio
	@docker compose -p pitch up -d cloakbrowser-manager
	@echo ""
	@if [ ! -d node_modules ] || [ bun.lock -nt node_modules ]; then \
		echo "  $(GREEN)Installing dependencies...$(RESET)"; \
		bun install; \
		echo ""; \
	fi
	@echo "  $(GREEN)Applying database migrations...$(RESET)"
	@bun run db:deploy
	@echo ""
	@echo "  $(GREEN)Starting studio server (API :3000) and frontend (:5173)...$(RESET)"
	@echo "  $(YELLOW)(Press Ctrl+C to stop)$(RESET)"
	@echo ""
	@bun run dev

start: dev

# Full stack in Docker (when containerized API is preferred)
dev-docker:
	@echo ""
	@echo "  $(GREEN)Starting full stack in Docker Compose...$(RESET)"
	@docker compose -p pitch up -d
	@echo ""
	@echo "  $(GREEN)All containers started. Run 'make logs' to tail output.$(RESET)"
	@echo ""

# Build only the bot image, then connect it to the API already started by `make dev`.
discord:
	docker compose -p pitch --profile discord build discord-bot
	DISCORD_PITCH_API_URL=http://host.docker.internal:3000 docker compose -p pitch --profile discord up -d --no-build --no-deps discord-bot

# ─── Production ───────────────────────────────────────────────────────────────
prod:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Starting production stack...$(RESET)"
	@echo ""
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml stop api
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml rm -f api
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml build --no-cache api
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo ""
	@echo "  $(GREEN)Production stack is up. Run 'make logs' to tail output.$(RESET)"
	@echo ""

# ─── Shared operations ────────────────────────────────────────────────────────
down:
	@echo ""
	@echo "  Stopping all containers..."
	docker compose -p pitch down
	@echo "  Cleaning up local dev server processes on ports 3000, 5173, 5174..."
	@for p in 3000 5173 5174; do \
		pid=$$(lsof -ti :$$p 2>/dev/null) && kill -9 $$pid 2>/dev/null || true; \
	done
	@echo "  $(GREEN)Done.$(RESET)"
	@echo ""

logs:
	docker compose -p pitch logs -f api

ps:
	docker compose -p pitch ps

# ─── Testing ──────────────────────────────────────────────────────────────────
unittest:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Running unit tests...$(RESET)"
	@echo ""
	bun run test
	@echo ""

# `make test` stays as an alias for the fast unit suite.
test: unittest

integration:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Running browser integration tests (playwright-cli)...$(RESET)"
	@echo ""
	bun run test:integration
	@echo ""

test-watch:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Running tests in watch mode...$(RESET)"
	@echo ""
	bun run test:watch

# ─── Sandbox ──────────────────────────────────────────────────────────────────
# The agent's shell runs under bubblewrap, which needs to create a user
# namespace and mount inside it — and a container normally forbids both. Which
# restriction bites depends on the host kernel, so this asks rather than
# guesses. Run it after any change to the api service's security settings.
sandbox-check:
	@docker compose -p pitch exec -T api node scripts/sandbox-check.mjs \
		|| node scripts/sandbox-check.mjs

# ─── Narration alignment ──────────────────────────────────────────────────────
# motion_align needs a ggml model and the image deliberately does not bake one
# in (~1.5GB). docker-compose mounts ./docker-data/whisper at the cache path
# the tool looks in, so dropping the file there is the whole install.
#
# Without it motion_align fails on every narrated video — and a failing
# motion_align is what once led an agent to hand-write a word timeline and cut
# a film to invented timings. WHISPER_MODEL_FILE=ggml-base.en.bin is a ~150MB
# alternative if the large model is too much.
WHISPER_MODEL_FILE ?= ggml-large-v3-turbo.bin
WHISPER_MODEL_URL  ?= https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$(WHISPER_MODEL_FILE)

whisper-model:
	@mkdir -p docker-data/whisper
	@if [ -s docker-data/whisper/$(WHISPER_MODEL_FILE) ]; then \
		echo "  $(GREEN)✓$(RESET) docker-data/whisper/$(WHISPER_MODEL_FILE) is already there"; \
	else \
		echo "  downloading $(WHISPER_MODEL_FILE) — this is large, once"; \
		curl -fL --progress-bar -o docker-data/whisper/$(WHISPER_MODEL_FILE).part $(WHISPER_MODEL_URL) \
			&& mv docker-data/whisper/$(WHISPER_MODEL_FILE).part docker-data/whisper/$(WHISPER_MODEL_FILE) \
			&& echo "  $(GREEN)✓$(RESET) motion_align can align narration now (restart the api container)"; \
	fi

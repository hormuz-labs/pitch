.DEFAULT_GOAL := help

# ─── Colours ──────────────────────────────────────────────────────────────────
BOLD  := \033[1m
CYAN  := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

# ─── Helpers ──────────────────────────────────────────────────────────────────
.PHONY: help dev prod down logs ps test test-watch unittest integration sandbox-check whisper-model

help:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Pitch — available targets$(RESET)"
	@echo ""
	@echo "  $(GREEN)make dev$(RESET)        — start in development mode (interactive)"
	@echo "  $(GREEN)make prod$(RESET)       — start all containers in production mode"
	@echo "  $(GREEN)make down$(RESET)       — stop and remove all containers"
	@echo "  $(GREEN)make logs$(RESET)       — tail logs for all running containers"
	@echo "  $(GREEN)make ps$(RESET)         — list container status"
	@echo "  $(GREEN)make unittest$(RESET)    — run fast pure unit tests (no browser)"
	@echo "  $(GREEN)make integration$(RESET) — run browser-driven integration tests (playwright-cli)"
	@echo "  $(GREEN)make test$(RESET)        — alias for unittest"
	@echo "  $(GREEN)make test-watch$(RESET)  — run unit tests in watch mode (vitest)"
	@echo "  $(GREEN)make sandbox-check$(RESET) — verify the agent's shell is confined on this host"
	@echo "  $(GREEN)make whisper-model$(RESET) — fetch the model motion_align needs"
	@echo ""

# ─── Development ──────────────────────────────────────────────────────────────
dev:
	@echo ""
	@echo "  $(BOLD)Development mode$(RESET)"
	@echo ""
	@if command -v fzf > /dev/null 2>&1; then \
		choice=$$(printf "essential — postgres & minio in Docker; run studio + web with bun\nall       — full stack in Docker" \
			| fzf --ansi --no-info --height=4 --prompt="  How do you want to run? " \
			| awk '{print $$1}'); \
	else \
		echo "  $(YELLOW)tip: install fzf for a nicer dropdown (brew install fzf)$(RESET)"; \
		echo ""; \
		printf "  [1] essential — postgres & minio in Docker; run studio + web with bun\n"; \
		printf "  [2] all       — full stack in Docker\n"; \
		echo ""; \
		printf "  Choice [1/2]: "; \
		read raw; \
		case "$$raw" in 2) choice="all" ;; *) choice="essential" ;; esac; \
	fi; \
	echo ""; \
		case "$$choice" in \
		essential) \
			echo "  $(YELLOW)Cleaning up previous containers and processes...$(RESET)"; \
			docker compose -p pitch down --remove-orphans 2>/dev/null; \
			for p in 3000 5174; do \
				pid=$$(lsof -ti :$$p 2>/dev/null) && kill $$pid 2>/dev/null && echo "  killed process on port $$p" || true; \
			done; \
			echo ""; \
			echo "  $(GREEN)Starting essential containers (postgres, minio)...$(RESET)"; \
			docker compose -p pitch up -d --wait postgres minio; \
			echo ""; \
			if [ ! -d node_modules ] || [ bun.lock -nt node_modules ]; then \
				echo "  $(GREEN)Installing dependencies...$(RESET)"; \
				bun install; \
				echo ""; \
			fi; \
			echo "  $(GREEN)Applying database migrations...$(RESET)"; \
			bun run db:deploy; \
			echo ""; \
			echo "  $(GREEN)Starting bun dev servers (Ctrl+C to stop all)...$(RESET)"; \
			echo ""; \
			bun run dev ;; \
		all) \
			echo "  $(GREEN)Starting full stack in Docker...$(RESET)"; \
			docker compose -p pitch up -d; \
			echo ""; \
			echo "  $(GREEN)All containers started. Run 'make logs' to tail output.$(RESET)"; \
			echo "" ;; \
	esac

# ─── Production ───────────────────────────────────────────────────────────────
prod:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Starting production stack...$(RESET)"
	@echo ""
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml stop studio
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml rm -f studio
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml build --no-cache studio
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo ""
	@echo "  $(GREEN)Production stack is up. Run 'make logs' to tail output.$(RESET)"
	@echo ""

# ─── Shared operations ────────────────────────────────────────────────────────
down:
	@echo ""
	@echo "  Stopping all containers..."
	docker compose -p pitch down
	@echo ""

logs:
	docker compose -p pitch logs -f studio

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

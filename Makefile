.DEFAULT_GOAL := help

# ─── Colours ──────────────────────────────────────────────────────────────────
BOLD  := \033[1m
CYAN  := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

# ─── Helpers ──────────────────────────────────────────────────────────────────
.PHONY: help dev prod down logs ps test test-watch

help:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Pitch — available targets$(RESET)"
	@echo ""
	@echo "  $(GREEN)make dev$(RESET)        — start in development mode (interactive)"
	@echo "  $(GREEN)make prod$(RESET)       — start all containers in production mode"
	@echo "  $(GREEN)make down$(RESET)       — stop and remove all containers"
	@echo "  $(GREEN)make logs$(RESET)       — tail logs for all running containers"
	@echo "  $(GREEN)make ps$(RESET)         — list container status"
	@echo "  $(GREEN)make test$(RESET)       — run all tests once (vitest run)"
	@echo "  $(GREEN)make test-watch$(RESET) — run tests in watch mode (vitest)"
	@echo ""

# ─── Development ──────────────────────────────────────────────────────────────
dev:
	@echo ""
	@echo "  $(BOLD)Development mode$(RESET)"
	@echo ""
	@if command -v fzf > /dev/null 2>&1; then \
		choice=$$(printf "essential — postgres, redis, minio & transcription in Docker; run web/api/worker with bun\nall       — full stack in Docker" \
			| fzf --ansi --no-info --height=4 --prompt="  How do you want to run? " \
			| awk '{print $$1}'); \
	else \
		echo "  $(YELLOW)tip: install fzf for a nicer dropdown (brew install fzf)$(RESET)"; \
		echo ""; \
		printf "  [1] essential — postgres, redis, minio & transcription in Docker; run web/api/worker with bun\n"; \
		printf "  [2] all       — full stack in Docker\n"; \
		echo ""; \
		printf "  Choice [1/2]: "; \
		read raw; \
		case "$$raw" in 2) choice="all" ;; *) choice="essential" ;; esac; \
	fi; \
	echo ""; \
	case "$$choice" in \
		essential) \
			echo "  $(GREEN)Starting essential containers (postgres, redis, minio, transcription)...$(RESET)"; \
			docker compose -p pitch up -d postgres redis minio transcription; \
			echo ""; \
			echo "  $(GREEN)Waiting for services to be healthy...$(RESET)"; \
			sleep 3; \
			echo ""; \
			if [ ! -d node_modules ] || [ bun.lock -nt node_modules ]; then \
				echo "  $(GREEN)Installing dependencies...$(RESET)"; \
				bun install; \
				echo ""; \
			fi; \
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
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml stop api worker
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml rm -f api worker
	docker compose -p pitch -f docker-compose.yml -f docker-compose.prod.yml build --no-cache api worker
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
	docker compose -p pitch logs -f api worker

ps:
	docker compose -p pitch ps

# ─── Testing ──────────────────────────────────────────────────────────────────
test:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Running tests...$(RESET)"
	@echo ""
	bun run test
	@echo ""

test-watch:
	@echo ""
	@echo "  $(BOLD)$(CYAN)Running tests in watch mode...$(RESET)"
	@echo ""
	bun run test:watch

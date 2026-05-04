SHELL := /bin/sh

DOCKER_BUILDKIT ?= 1
COMPOSE_DOCKER_CLI_BUILD ?= 1
DC := DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) COMPOSE_DOCKER_CLI_BUILD=$(COMPOSE_DOCKER_CLI_BUILD) docker compose

.PHONY: help up upd build rebuild down restart ps logs config pull prune cli-install

help:
	@echo "Targets:"
	@echo "  make up          # compose up --build"
	@echo "  make upd         # compose up -d --build"
	@echo "  make build       # compose build"
	@echo "  make rebuild     # compose build --no-cache"
	@echo "  make down        # compose down"
	@echo "  make restart     # compose restart"
	@echo "  make ps          # compose ps"
	@echo "  make logs        # compose logs -f cibi-api"
	@echo "  make config      # compose config"
	@echo "  make pull        # compose pull"
	@echo "  make prune       # builder/image prune"
	@echo "  make cli-install # run CLI installer profile"

up:
	@$(DC) up --build

upd:
	@$(DC) up -d --build

build:
	@$(DC) build

rebuild:
	@$(DC) build --no-cache

down:
	@$(DC) down

restart:
	@$(DC) restart

ps:
	@$(DC) ps

logs:
	@$(DC) logs -f cibi-api

config:
	@$(DC) config

pull:
	@$(DC) pull

prune:
	@docker builder prune -f
	@docker image prune -f

cli-install:
	@$(DC) --profile cli run --rm cibi-cli-install

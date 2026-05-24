.PHONY: help setup build dev watch test typecheck lint check playtest upload clean

help:
	@echo "ModCase - Make targets"
	@echo ""
	@echo "  make setup       Install npm dependencies"
	@echo "  make build       Build the Devvit server bundle"
	@echo "  make dev         Start Devvit playtest flow"
	@echo "  make watch       Build in watch mode"
	@echo "  make test        Run Vitest"
	@echo "  make typecheck   Run TypeScript type checking"
	@echo "  make lint        Verify Devvit config + typecheck"
	@echo "  make check       Run lint + tests"
	@echo "  make playtest    Start Devvit playtest flow"
	@echo "  make upload      Upload via Devvit CLI"
	@echo "  make clean       Remove build artifacts"

setup:
	npm install

build:
	npm run build

dev:
	npm run dev

watch:
	npm run watch

test:
	npm test

typecheck:
	npm run typecheck

lint:
	npm run lint

check:
	npm run check

playtest:
	npm run dev

upload:
	npm run devvit:upload

clean:
	rm -rf dist/ coverage/ .vite/ .vitest/ *.tsbuildinfo

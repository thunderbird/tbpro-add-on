# ============================================================
# Makefile — CI / local task runner
# Mirrors the GitHub Actions workflows so every stage can be
# reproduced locally with a single `make <target>` call.
# ============================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ── Common ──────────────────────────────────────────────────

.PHONY: install
install: ## Install root dependencies and bootstrap monorepo
	pnpm install --filter @thunderbird/tbpro-add-on && lerna run bootstrap

# ── Backend (packages/send/backend) ─────────────────────────

.PHONY: install-backend backend-env backend-test validate-backend

install-backend: ## Install Send backend dependencies
	cd packages/send && pnpm install --filter send-backend

backend-env: ## Copy .env.sample → .env for backend
	cd packages/send/backend && cp .env.sample .env

backend-test: ## Run backend prisma generate + ci:validate
	cd packages/send/backend && pnpm prisma generate && pnpm ci:validate

validate-backend: install install-backend backend-env backend-test ## Full backend validation (local)

# ── IAC / Pulumi ────────────────────────────────────────────

.PHONY: iac-lint

iac-lint: ## Lint Send Pulumi infrastructure code with ruff
	ruff check ./packages/send/pulumi
	ruff format --check ./packages/send/pulumi

# ── Frontend (packages/send/frontend) ───────────────────────

.PHONY: install-frontend frontend-test validate-frontend

install-frontend: ## Install Send frontend + related dependencies
	pnpm install --filter tbpro-shared
	pnpm install --filter send-frontend
	pnpm install --filter send-backend
	lerna run db:generate --scope=send-backend

frontend-test: ## Run frontend tests and lint
	lerna run ci:validate --scope=send-frontend

validate-frontend: install install-frontend frontend-test ## Full frontend validation (local)

# ── Shared (packages/shared) ────────────────────────────────

.PHONY: install-shared shared-test validate-shared

install-shared: ## Install shared package dependencies
	pnpm install --filter tbpro-shared
	pnpm install --filter send-backend

shared-test: ## Run shared package tests
	lerna run test --scope=tbpro-shared

validate-shared: install install-shared shared-test ## Full shared package validation (local)

# ── Addon (packages/addon) ──────────────────────────────────

.PHONY: install-addon addon-test validate-addon

install-addon: ## Install addon + dependent package dependencies
	pnpm install --filter tbpro-shared
	pnpm install --filter send-frontend
	pnpm install --filter addon

addon-test: ## Run addon tests and lint
	lerna run ci:validate --scope=addon
	lerna run test --scope=addon

validate-addon: install install-addon addon-test ## Full addon validation (local)

# ── Assist Frontend ─────────────────────────────────────────

.PHONY: assist-frontend-test

assist-frontend-test: ## Run assist frontend unit tests
	lerna run test:unit --scope=assist-frontend

# ── Integration Tests ────────────────────────────────────────

.PHONY: install-integration setup-local build-backend-image run-integration-test integration-test

install-integration: ## Install dependencies for integration tests
	pnpm install --filter tbpro-shared
	pnpm i --filter "send-*"

setup-local: ## Set up local Send environment
	cd packages/send && echo Y | pnpm setup:local

build-backend-image: ## Build backend Docker image
	lerna run build-image:backend --scope=send-suite

run-integration-test: ## Run the integration test suite
	pnpm run test:integration:ci

integration-test: install install-integration setup-local build-backend-image run-integration-test ## Full integration test flow (local)

# ── E2E Tests ────────────────────────────────────────────────

.PHONY: install-e2e run-e2e-test e2e-test

install-e2e: ## Install dependencies for E2E tests
	pnpm i --filter "send-*"
	pnpm install --filter tbpro-shared

run-e2e-test: ## Run E2E test suite
	lerna run test:e2e:ci --scope=send-suite-e2e

e2e-test: install install-e2e setup-local build-backend-image run-e2e-test ## Full E2E test flow (local)

# ── Audit ────────────────────────────────────────────────────

.PHONY: audit-fix audit-test

audit-fix: ## Run pnpm audit --fix
	pnpm audit --fix || true

audit-test: backend-test frontend-test addon-test shared-test assist-frontend-test ## Run all tests after audit fix

# ── Nightly E2E (BrowserStack) ───────────────────────────────

.PHONY: install-nightly-e2e nightly-e2e-desktop-firefox nightly-e2e-desktop-safari \
        nightly-e2e-desktop-chromium nightly-e2e-mobile-android nightly-e2e-mobile-ios \
        nightly-e2e-desktop nightly-e2e-mobile

install-nightly-e2e: ## Install nightly E2E test dependencies
	cd packages/send/e2e && npm install

nightly-e2e-desktop-firefox: ## Run nightly desktop Firefox E2E tests
	cd packages/send/e2e && cp .env.prod.sample .env && npm run test:e2e:nightly:prod:browserstack:desktop:firefox

nightly-e2e-desktop-safari: ## Run nightly desktop Safari E2E tests
	cd packages/send/e2e && cp .env.prod.sample .env && npm run test:e2e:nightly:prod:browserstack:desktop:safari

nightly-e2e-desktop-chromium: ## Run nightly desktop Chromium E2E tests
	cd packages/send/e2e && cp .env.prod.sample .env && npm run test:e2e:nightly:prod:browserstack:desktop:chromium

nightly-e2e-mobile-android: ## Run nightly mobile Android Chrome E2E tests
	cd packages/send/e2e && cp .env.prod.sample .env && npm run test:e2e:nightly:prod:browserstack:mobile:android:chrome

nightly-e2e-mobile-ios: ## Run nightly mobile iOS Safari E2E tests
	cd packages/send/e2e && cp .env.prod.sample .env && npm run test:e2e:nightly:prod:browserstack:mobile:ios:safari

nightly-e2e-desktop: install-nightly-e2e nightly-e2e-desktop-firefox nightly-e2e-desktop-safari nightly-e2e-desktop-chromium ## Run all nightly desktop E2E tests

nightly-e2e-mobile: install-nightly-e2e nightly-e2e-mobile-android nightly-e2e-mobile-ios ## Run all nightly mobile E2E tests

# ── Build (for merge / deploy) ───────────────────────────────

.PHONY: build-backend build-frontend build-addon

build-backend: ## Build backend package and Docker image
	pnpm install --filter send-backend
	lerna run build-image:backend --scope=send-suite

build-frontend: ## Build Send frontend assets
	pnpm install --filter tbpro-shared
	pnpm install --filter send-frontend
	cd packages/send/frontend && pnpm build

build-addon: ## Build addon XPI
	pnpm install --filter tbpro-shared
	pnpm install --filter addon
	pnpm install --filter send-frontend
	lerna run build --scope=addon

# ── Devcontainer ─────────────────────────────────────────────

.PHONY: devcontainer-check

devcontainer-check: ## Check devcontainer binaries exist
	./.devcontainer/check_binaries.sh

# ── Composite ───────────────────────────────────────────────

.PHONY: validate

validate: validate-backend iac-lint validate-frontend validate-shared validate-addon ## Run all validation checks (local)

# ── Clean ────────────────────────────────────────────────────

.PHONY: clean

clean: ## Remove node_modules, build artifacts, and caches
	# ── node_modules ──
	rm -rf node_modules
	rm -rf packages/addon/node_modules
	rm -rf packages/shared/node_modules
	rm -rf packages/send/node_modules
	rm -rf packages/send/backend/node_modules
	rm -rf packages/send/frontend/node_modules
	rm -rf packages/send/e2e/node_modules
	rm -rf packages/assist/frontend/node_modules
	# ── build outputs ──
	rm -rf packages/addon/dist
	rm -rf packages/shared/dist
	rm -rf packages/send/backend/dist
	rm -rf packages/send/backend/build
	rm -rf packages/send/backend/builds
	rm -rf packages/send/frontend/dist
	rm -rf packages/send/frontend/dist-web
	rm -rf packages/assist/frontend/dist
	# ── generated extensions ──
	rm -f packages/addon/tbpro-addon-*.xpi
	# ── test artifacts ──
	rm -rf packages/addon/coverage
	rm -rf packages/shared/coverage
	rm -rf packages/send/backend/coverage
	rm -rf packages/send/frontend/coverage
	rm -rf packages/assist/frontend/coverage
	rm -rf packages/send/e2e/playwright-report
	rm -rf packages/send/e2e/playwright-test-results
	rm -rf packages/send/e2e/blob-report
	rm -rf packages/send/e2e/playwright/.cache
	rm -rf packages/send/e2e/log
	rm -rf packages/assist/frontend/cypress/videos
	rm -rf packages/assist/frontend/cypress/screenshots
	# ── caches & generated files ──
	rm -rf .nx/cache .nx/workspace-data
	rm -f packages/addon/*.tsbuildinfo
	rm -f packages/shared/*.tsbuildinfo
	rm -f packages/send/backend/*.tsbuildinfo
	rm -f packages/send/frontend/*.tsbuildinfo
	rm -f packages/assist/frontend/*.tsbuildinfo
	# ── python artifacts ──
	rm -rf packages/assist/backend/__pycache__
	rm -rf packages/assist/pulumi/__pycache__
	rm -rf packages/assist/pulumi/.venv
	rm -rf packages/assist/pulumi/venv

# ── Help ─────────────────────────────────────────────────────

.PHONY: help

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

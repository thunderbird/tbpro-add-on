# GitHub Workflows Build Step Graph

Complete visualization of the CI/CD pipeline for the tbpro-add-on project.

---

## Workflows Summary

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **validate** | PR/Branch push | Unit tests & linting |
| **integration-test** | PR/Branch push | Integration tests |
| **e2e-test** | PR/Branch push | E2E tests (local FS) |
| **e2e-bucket-test** | PR/Branch push | E2E tests (Backblaze) |
| **validate-devcontainer** | PR/Branch push | Dev container validation |
| **merge** | Main branch push | Deploy to stage |
| **build-and-push-devcontainer** | Main branch push | Cache dev container |
| **release** | Release published | Deploy to production |

---

## 1. VALIDATE WORKFLOW
**Trigger**: `push` to branches (all except `main`)  
**File**: `validate.yml`

### Jobs

#### detect-changes *(always runs)*
Detects which packages changed to conditionally trigger other jobs.

| Output | Triggers | Condition |
|--------|----------|-----------|
| `backend-changed` | backend-tests | Changes in `packages/send/backend/**` |
| `frontend-changed` | frontend-tests-and-lint | Changes in `packages/send/frontend/**` |
| `shared-changed` | shared-tests | Changes in `packages/shared/**` |
| `addon-changed` | addon-changes | Changes in `packages/addon/**` |
| `iac-changed` | iac-lint | Changes in `packages/send/pulumi/**` or workflow changes |

#### backend-tests *(if backend-changed)*
```
1. Checkout code
2. Install dependencies
   → pnpm install + lerna bootstrap
3. Setup environment
   → Copy .env.sample → .env
   → Inject B2 & S3 secrets
4. Generate Prisma types
5. Run tests: pnpm ci:validate
```

#### iac-lint *(if iac-changed)*
```
1. Checkout code
2. Python linting
   → ruff check ./packages/send/pulumi
   → ruff format --check ./packages/send/pulumi
```

#### frontend-tests-and-lint *(if frontend-changed)*
```
1. Checkout code
2. Install all dependencies
   → tbpro-shared + send-frontend + send-backend
   → Generate DB types
3. Create .env file with test config
4. Run tests: lerna run ci:validate --scope=send-frontend
```

#### shared-tests *(if shared-changed)*
```
1. Checkout code
2. Install dependencies
   → tbpro-shared + send-backend
3. Run tests: lerna run test --scope=tbpro-shared
```

#### addon-changes *(if addon-changed)*
```
1. Checkout code
2. Create .env file
3. Install dependencies
   → all packages including addon
4. Run: lerna run ci:validate --scope=addon
5. Run: lerna run test --scope=addon
```

---

## 2. INTEGRATION TEST WORKFLOW
**Trigger**: `push` to branches (all except `main`)  
**File**: `integration-test.yml`

### Jobs

#### detect-changes *(always runs)*
Same path filtering as validate workflow.

#### integration-tests *(if backend-changed OR frontend-changed)*
Runs full stack integration tests.

```
1. Checkout code
2. Setup Node v22
3. Install all dependencies & setup local environment
   → pnpm + bun global install
   → Bootstrap monorepo
   → pnpm setup:local
4. Build backend Docker image
5. Run integration tests: pnpm run test:integration:ci
```

---

## 3. E2E TEST WORKFLOW (Local Filesystem)
**Trigger**: `push` to branches (all except `main`) or manual trigger  
**File**: `e2e-test.yml`

### Jobs

#### detect-changes *(always runs)*
Same path filtering as validate workflow.

#### end-to-end-tests *(if backend-changed OR frontend-changed)*
Runs full E2E tests using local filesystem for storage.

```
1. Checkout code
2. Setup Node v22
3. Install dependencies & setup local environment
4. Configure backend env vars
   → OIDC_CLIENT_ID
   → OIDC_CLIENT_SECRET
   → OIDC_TOKEN_INTROSPECTION_URL
5. Configure frontend env vars
   → VITE_OIDC_CLIENT_ID
   → VITE_OIDC_ROOT_URL
6. Build backend Docker image
7. Run E2E tests: lerna run test:e2e:ci --scope=send-suite-e2e
8. Upload Playwright report as artifact (if not cancelled)
```

---

## 4. E2E BUCKET TEST WORKFLOW (Backblaze)
**Trigger**: `push` to branches (all except `main`) or manual trigger  
**File**: `e2e-bucket-test.yml`

### Jobs

#### detect-changes *(always runs)*
Same path filtering as validate workflow.

#### end-to-end-tests *(if backend-changed OR frontend-changed)*
Runs full E2E tests using Backblaze B2 for storage (tests chunked uploads with 1MB split).

```
1. Checkout code
2. Setup Node v22
3. Install dependencies & setup local environment
4. Configure B2 storage secrets in backend .env
5. Set frontend split size to 1MB (tests chunking)
6. Configure OIDC env vars (backend & frontend)
7. Build backend Docker image
8. Run E2E tests: lerna run test:e2e:ci --scope=send-suite-e2e
9. Upload Playwright report as artifact (if not cancelled)
```

---

## 5. MERGE WORKFLOW (Deploy to Stage)
**Trigger**: `push` to `main` branch  
**File**: `merge.yml`  
**Environments**: `send-stage`

### Jobs

#### detect-changes *(always runs)*
Same path filtering but triggers different downstream jobs.

#### backend-merge *(if backend-changed)*
Builds Docker image, pushes to ECR, and deploys to stage.

```
📦 BUILD & PUSH TO ECR
1. Checkout & setup Node v22
2. Install & build
   → pnpm install --filter send-backend
   → lerna run build-image:backend
3. AWS setup (us-east-1)
   → Configure credentials
   → Login to ECR
4. Docker build & push
   → docker build ./packages/send/backend/build
   → docker push $ECR_TAG
5. Save ECR tag as artifact for production deploys

🚀 DEPLOY TO STAGE (via Pulumi)
1. AWS setup (eu-central-1)
2. Setup Python & Pulumi
   → Install virtualenv
   → Install Pulumi CLI
   → pip install -Ur requirements.txt
3. Update config
   → Create newimage.yaml with new ECR tag
   → yq merge into config.stage.yaml
4. Deploy
   → pulumi stack select stage
   → pulumi up --target-dependents
```

#### frontend-merge *(if frontend-changed)*
Builds frontend assets for both stage and production, generates XPIs.

```
🔧 SETUP
1. Checkout & setup Node v22, Bun
2. AWS credentials (eu-central-1)

📦 STAGE BUILD
1. Create .env with stage URLs & secrets
   → send-stage.tb.pro
   → Sentry, PostHog, OIDC config
2. Build static assets & XPI
   → IS_CI_AUTOMATION=yes pnpm build
3. Save dist-web-stage & send-suite-stage-*.xpi as artifacts

📦 PRODUCTION BUILD
1. Create .env with production URLs & secrets
   → send.tb.pro
   → Sentry, PostHog, OIDC config (prod)
2. Build static assets & XPI
   → IS_CI_AUTOMATION=yes pnpm build
3. Save dist-web-prod & send-suite-prod-*.xpi as artifacts
```

---

## 6. VALIDATE DEVCONTAINER WORKFLOW
**Trigger**: `push` to branches (all except `main`)  
**File**: `validate-devcontainer.yml`

### Jobs

#### detect-changes *(always runs)*
Detects changes in `.devcontainer/**` or workflow changes.

#### devcontainer-test-build *(if devcontainer-changed)*
Builds a test devcontainer image.

```
1. Checkout code
2. Login to GitHub Container Registry
3. Build & push test image
   → Image: cached-devcontainer-test:latest
```

#### test-devcontainer-binaries-exist *(after test-build completes)*
Runs in the built devcontainer to verify all required tools are present.

```
1. Run in container: cached-devcontainer-test:latest
2. Checkout code
3. Execute: .devcontainer/check_binaries.sh
```

---

## 7. BUILD & PUSH DEVCONTAINER WORKFLOW
**Trigger**: `push` to `main` branch  
**File**: `build-and-push-devcontainer.yml`

### Jobs

#### devcontainer-build *(always runs on main)*
Caches the devcontainer for faster CI runs.

```
1. Checkout code
2. Login to GitHub Container Registry
3. Build & push cached image
   → Cache from: previous builds
   → Image: cached-devcontainer:latest
   → Always push to main
```

---

## 8. RELEASE WORKFLOW (Deploy to Production)
**Trigger**: `release` event with type `published`  
**File**: `release.yml`  
**Environments**: `send-prod`

### Jobs

#### deploy-backend *(if ecr_tag.zip in release assets)*
Retagged stage backend image with version semver and deploys to production.

```
🐳 RETAG IMAGE WITH SEMVER
1. Checkout & download ecr_tag.zip artifact
2. AWS setup (us-east-1)
   → Configure credentials
   → Login to ECR
3. Extract source ECR tag from artifact
4. Read version from package.json (semver)
5. Create target tag: project:0.2.1
6. Docker operations
   → docker pull $source_tag
   → docker tag $source_tag $target_tag
   → docker push $target_tag

🚀 DEPLOY TO PRODUCTION (via Pulumi)
1. AWS setup (eu-central-1)
2. Setup Python 3.13 & Pulumi
3. Update config
   → Create newimage.yaml with versioned tag
   → yq merge into config.prod.yaml
4. Deploy
   → pulumi stack select prod
   → pulumi up --target-dependents (with protection disabled)
```

#### deploy-frontend *(if dist-web-prod.zip in release assets)*
Deploys production frontend assets to S3 and invalidates CloudFront.

```
1. Download dist-web-prod.zip artifact
2. AWS setup (eu-central-1)
3. Deploy to S3
   → unzip dist-web-prod.zip
   → aws s3 cp → s3://tb-send-suite-prod-frontend/
4. Invalidate CDN
   → aws cloudfront create-invalidation --paths "/*"
```

#### deploy-xpi-prod *(if xpi-prod.zip in release assets)*
Deploys production XPI to Thunderbird ATN (Add-on Registry).

```
1. Download xpi-prod.zip artifact
2. Setup Node v22 & Bun
3. Install dependencies
   → pnpm install send-frontend
4. Deploy to ATN
   → unzip xpi-prod.zip
   → pnpm deploy-xpi $xpi_file
   → (continues on error)
```

---

## Dependency & Trigger Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    GITHUB WORKFLOWS PIPELINE                    │
└─────────────────────────────────────────────────────────────────┘

PULL REQUESTS & FEATURE BRANCHES (any branch except main)
├─ validate.yml                    ✓ Path-based conditional jobs
├─ integration-test.yml            ✓ Full stack tests
├─ e2e-test.yml                    ✓ Browser tests (local FS)
├─ e2e-bucket-test.yml             ✓ Browser tests (Backblaze)
└─ validate-devcontainer.yml       ✓ Dev container validation

MAIN BRANCH (on merge/push to main)
├─ merge.yml                       ✓ Deploy to STAGE
│  ├─ backend-merge               ✓ ECR + Pulumi deploy
│  └─ frontend-merge              ✓ Build stage + prod assets
└─ build-and-push-devcontainer.yml ✓ Cache devcontainer

RELEASE (GitHub Release published)
└─ release.yml                     ✓ Deploy to PRODUCTION
   ├─ deploy-backend              ✓ Retag & deploy backend
   ├─ deploy-frontend             ✓ Deploy to S3 + CDN
   └─ deploy-xpi-prod             ✓ Deploy to ATN
```

---

## Quick Reference

### Workflows by Frequency
| Frequency | Workflows |
|-----------|-----------|
| Every PR/Branch | validate, integration-test, e2e-test, e2e-bucket-test, validate-devcontainer |
| Main merge | merge (stage deploy), build-and-push-devcontainer |
| Release | release (prod deploy) |

### External Services
| Service | Purpose | Used In |
|---------|---------|---------|
| **AWS ECR** | Docker image registry | backend-merge, deploy-backend |
| **AWS S3** | Static asset hosting | deploy-frontend |
| **AWS CloudFront** | CDN | deploy-frontend |
| **Pulumi** | Infrastructure as Code | backend-merge, deploy-backend |
| **Backblaze B2** | Object storage (optional) | e2e-bucket-test, backend tests |
| **GitHub Container Registry** | Devcontainer images | All jobs (via cached-devcontainer) |
| **Thunderbird ATN** | Add-on registry | deploy-xpi-prod |

### Key Environment Variables
| Scope | Purpose |
|-------|---------|
| Stage | VITE_SENTRY_DSN_STAGE, VITE_POSTHOG_HOST_STAGE, etc. |
| Production | VITE_SENTRY_DSN_PROD, VITE_POSTHOG_HOST_PROD, etc. |
| B2 Storage | B2_REGION, B2_ENDPOINT, B2_APPLICATION_KEY, etc. |
| OIDC | OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_TOKEN_INTROSPECTION_URL |

### Common Setup Steps (Most Workflows)
```bash
# 1. Install global tools
npm install -g pnpm
npm install -g lerna

# 2. Bootstrap monorepo
pnpm install --filter @thunderbird/tbpro-add-on
lerna run bootstrap

# 3. Install specific package dependencies
pnpm install --filter send-backend      # or other packages
```

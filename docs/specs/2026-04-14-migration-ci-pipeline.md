# Database Migration CI Pipeline Design

**Date:** 2026-04-14 (revised after 10-agent review)
**Issue:** thunderbird/tbpro-add-on#273  
**Assignee:** Arron Atchison

---

## Context

Prisma migrations are currently applied inside `entry.sh` via `pnpm db:update` (`prisma migrate deploy`) on every container start. In a 2-replica Fargate setup this means:

- Both replicas race to apply the same migration on startup
- Auto-scaling events re-run migrations unnecessarily
- There is no drain before schema changes (old code can see a partially-migrated schema)
- There is no snapshot to roll back to if a migration breaks things
- There is no CI-level gate to confirm a migration succeeded before enabling traffic

This design adds a safe, observable, rollback-capable migration pipeline to both `merge.yml` (stage) and `release.yml` (prod).

---

## Solution Overview

1. **Detect** — `paths-filter` on `prisma/migrations/**` in the `detect-changes` job  
2. **Pre-flight** — check for a stranded service left by a previously-cancelled run  
3. **Drain** — suspend autoscaler scaling actions (without changing `min_capacity`), scale ECS to 0, wait for ALB deregistration  
4. **Snapshot** — create a Neon branch from the live database; poll until the branch is materialized  
5. **Migrate** — Pulumi deploys a new task definition that includes a `migrate` init container (`essential: true`); ECS starts tasks, the init container runs `prisma migrate deploy` and exits, then `backend` starts (enforced via ECS `dependsOn: condition: SUCCESS`)  
6. **Verify** — early failure detection via task polling + `aws ecs wait services-stable`  
7. **Re-enable** — dedicated cleanup job restores autoscaler and `desired_count`; fires even on cancellation  
8. **Rollback (on any failure)** — poll Neon restore to completion, then revert ECS task definition; run `pulumi refresh` to reconcile state  

For **frontend**: `frontend-invalidate-*-cdn` jobs are updated to accept either the migrate job or the normal deploy job as the valid backend success signal. Stage and prod use different condition patterns because they have different job-graph architectures.

---

## Architecture

### Job graph (merge.yml, stage)

```
detect-changes
  ├─ backend-build-stage             (if backend-changed)
  │    ├─ backend-migrate-stage      (if backend-changed && migration-changed) ← NEW
  │    └─ backend-deploy-stage-aws   (if backend-changed && !migration-changed)
  │
  ├─ autoscaler-cleanup-stage        (needs: backend-migrate-stage, if: always()) ← NEW
  │
  ├─ frontend-build                  (if frontend-changed)
  │    └─ frontend-deploy-stage-aws
  │         └─ frontend-invalidate-stage-cdn
  │              (needs both backend jobs + frontend; fires if either backend succeeded or backend didn't change)
  └─ addon-changes                   (if addon/frontend-changed)
```

`backend-migrate-stage` and `backend-deploy-stage-aws` are **mutually exclusive** — exactly one runs per push. `autoscaler-cleanup-stage` is a separate job so it fires even when `backend-migrate-stage` is cancelled.

### Job graph (release.yml, prod)

```
[Release published]
  ├─ backend-migrate-prod            (if ecr_tag.zip asset present) ← replaces backend-deploy-prod-aws
  ├─ autoscaler-cleanup-prod         (needs: backend-migrate-prod, if: always()) ← NEW
  ├─ frontend-deploy-prod-aws        (if dist-web-prod.zip asset present)
  └─ frontend-invalidate-prod-cdn    (see prod-specific condition below)
```

For prod, the migration pipeline always runs when a backend is being deployed (`prisma migrate deploy` is a no-op if no pending migrations, and the snapshot/drain overhead is acceptable for production).

---

## Component Design

### 1. Migration Detection (stage)

**Add filter to `detect-changes` in `merge.yml`:**

```yaml
# Under steps.check.with.filters:
migration-changed:
  - 'packages/send/backend/prisma/migrations/**'
```

**Add to `detect-changes` job `outputs:` block** (this is required — without it, downstream jobs see an empty string):

```yaml
outputs:
  backend-changed: ...   # existing
  iac-changed: ...       # existing
  frontend-changed: ...  # existing
  addon-changed: ...     # existing
  migration-changed: ${{ steps.check.outputs.migration-changed == 'true' && github.event.inputs.skip_migration != 'true' }}  # NEW
```

**Add `skip_migration` workflow dispatch input** (operational escape hatch for force-redeploy without migration):

```yaml
on:
  workflow_dispatch:
    inputs:
      skip_migration:
        description: Force the non-migration deploy path even if migration files changed
        required: false
        type: boolean
        default: false
      # ... existing inputs ...
```

**Job conditions (mutually exclusive):**
- `backend-migrate-stage`: `needs.detect-changes.outputs.backend-changed == 'true' && needs.detect-changes.outputs.migration-changed == 'true'`
- `backend-deploy-stage-aws`: `needs.detect-changes.outputs.backend-changed == 'true' && needs.detect-changes.outputs.migration-changed != 'true'`

### 2. Pre-flight Check

Run at the start of `backend-migrate-stage` before doing anything else. Detects a service left stranded at `desired_count=0` with the autoscaler suspended by a previously-cancelled run:

```bash
CURRENT_DESIRED=$(aws ecs describe-services \
  --cluster $CLUSTER --services $SERVICE \
  --query 'services[0].desiredCount' --output text)

if [ "$CURRENT_DESIRED" = "0" ]; then
  echo "ERROR: Service is already at desired_count=0. A previous migration run may have been cancelled."
  echo "Manually verify the service state and re-enable autoscaling before retrying."
  exit 1
fi
```

This surfaces the stranded state as a loud failure rather than silently proceeding.

### 3. Traffic Drain

**Critical:** Do NOT pass `--min-capacity 0` to `register-scalable-target`. That would cause Pulumi state drift. Only use the suspend flags.

```bash
# 1. Suspend autoscaler scaling actions (min_capacity stays at 2 in AWS state, matching Pulumi config)
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id "service/${CLUSTER}/${SERVICE}" \
  --scalable-dimension ecs:service:DesiredCount \
  --suspended-state "DynamicScalingInSuspended=true,DynamicScalingOutSuspended=true,ScheduledScalingSuspended=true"

# Brief pause to let the suspended state propagate before scaling down
sleep 5

# 2. Record previous task definition ARN for rollback — must be persisted to GITHUB_OUTPUT
PREV_TASK_DEF=$(aws ecs describe-services \
  --cluster $CLUSTER --services $SERVICE \
  --query 'services[0].taskDefinition' --output text)
echo "prev_task_def=${PREV_TASK_DEF}" >> "$GITHUB_OUTPUT"

# Fail loudly if we couldn't capture it
if [ -z "$PREV_TASK_DEF" ] || [ "$PREV_TASK_DEF" = "None" ]; then
  echo "ERROR: Could not determine current task definition ARN. Aborting."
  exit 1
fi

# 3. Scale to 0
aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 0

# 4. Wait for ECS runningCount to reach 0
aws ecs wait services-stable --region eu-central-1 --cluster $CLUSTER --services $SERVICE

# 5. Additional wait for ALB target deregistration delay (AWS default is 300s;
#    this should be reduced to 30s in the Pulumi config for both stage and prod).
#    If deregistration_delay is set to 30s in Pulumi config, a 35s sleep is sufficient here.
sleep 35
```

**Required Pulumi config change** — add to both `config.stage.yaml` and `config.prod.yaml` under the service definition:

```yaml
services:
  send-suite:
    deregistration_delay: 30   # default is 300; reduce so drain completes quickly
    # ... existing fields ...
```

**Required IAM change** — the CI user (`AwsAutomationUser`) currently has no `application-autoscaling` permissions. Add to the Pulumi config (the `additional_policies` hook exists and is commented out):

```yaml
tb:ci:AwsAutomationUser:
  ci:
    additional_policies:
      - arn:aws:iam::768512802988:policy/send-suite-STACK-autoscaling-ci
```

And define this policy to grant `application-autoscaling:RegisterScalableTarget` and `application-autoscaling:DescribeScalableTargets` scoped to the ECS service resource.

### 4. Neon Snapshot

**Secret/variable scope:** `NEON_API_KEY` must be a **per-environment** secret (not repo-wide) to limit blast radius. Store it in the `send-stage` and `send-prod` GitHub environments with separate Neon API keys scoped to each project.

| Name | Type | Scope | Value |
|------|------|-------|-------|
| `NEON_API_KEY` | secret | **per-environment** (`send-stage`, `send-prod`) | Project-scoped Neon API key |
| `NEON_PROJECT_ID` | variable | per-environment | Neon project ID for that env |
| `NEON_BRANCH_ID` | variable | per-environment | ID of the main database branch |

**Create snapshot and poll until materialized:**

```bash
# Create the snapshot branch
SNAPSHOT_RESPONSE=$(curl --silent --fail-with-body --show-error -X POST \
  "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches" \
  -H "Authorization: Bearer ${NEON_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"branch\": {\"parent_id\": \"${NEON_BRANCH_ID}\", \"name\": \"migration-snapshot-${GITHUB_RUN_ID}\"}}")

# Validate the branch ID before proceeding — abort if Neon didn't return a valid ID
SNAPSHOT_BRANCH_ID=$(echo "$SNAPSHOT_RESPONSE" | jq -r '.branch.id // empty')
if [ -z "$SNAPSHOT_BRANCH_ID" ] || ! echo "$SNAPSHOT_BRANCH_ID" | grep -qE '^br-[a-z0-9-]+$'; then
  echo "ERROR: Failed to create Neon snapshot branch. Response: $SNAPSHOT_RESPONSE"
  exit 1
fi
echo "snapshot_branch_id=${SNAPSHOT_BRANCH_ID}" >> "$GITHUB_OUTPUT"

# Poll the create-branch operation until it reaches 'finished'
BRANCH_OP_ID=$(echo "$SNAPSHOT_RESPONSE" | jq -r '.operations[0].id // empty')
for i in $(seq 1 24); do
  OP_STATUS=$(curl --silent --fail-with-body --show-error \
    "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/operations/${BRANCH_OP_ID}" \
    -H "Authorization: Bearer ${NEON_API_KEY}" | jq -r '.operation.status')
  echo "Neon branch creation status: $OP_STATUS (attempt $i/24)"
  case "$OP_STATUS" in
    finished) break ;;
    cancelled|skipped) echo "ERROR: Neon branch creation did not complete: $OP_STATUS"; exit 1 ;;
    failed)
      FAIL_COUNT=$((FAIL_COUNT+1))
      [ $FAIL_COUNT -gt 3 ] && { echo "ERROR: Neon branch creation failed repeatedly"; exit 1; }
      ;;
  esac
  sleep 5
done
```

**Restore main branch to snapshot state (called from rollback):**

```bash
# NOTE: preserve_under_name saves the current (post-migration, broken) state of the main branch
# before it is overwritten — useful for forensics. The snapshot branch itself is preserved separately.
RESTORE_RESPONSE=$(curl --silent --fail-with-body --show-error -X POST \
  "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches/${NEON_BRANCH_ID}/restore" \
  -H "Authorization: Bearer ${NEON_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"source_branch_id\": \"${SNAPSHOT_BRANCH_ID}\", \"preserve_under_name\": \"failed-migration-${GITHUB_RUN_ID}\"}")

RESTORE_OP_ID=$(echo "$RESTORE_RESPONSE" | jq -r '.operations[0].id // empty')
if [ -z "$RESTORE_OP_ID" ]; then
  echo "ERROR: Neon restore did not return an operation ID. Response: $RESTORE_RESPONSE"
  echo "WARNING: Database may be in a partially-migrated state. Manual intervention required."
  exit 1
fi

# Poll until restore completes — ECS must NOT start until this finishes
FAIL_COUNT=0
for i in $(seq 1 60); do
  OP_STATUS=$(curl --silent --fail-with-body --show-error \
    "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/operations/${RESTORE_OP_ID}" \
    -H "Authorization: Bearer ${NEON_API_KEY}" | jq -r '.operation.status')
  echo "Neon restore status: $OP_STATUS (attempt $i/60)"
  case "$OP_STATUS" in
    finished) echo "Neon restore complete."; break ;;
    cancelled|skipped) echo "ERROR: Neon restore did not complete: $OP_STATUS"; exit 1 ;;
    failed)
      FAIL_COUNT=$((FAIL_COUNT+1))
      [ $FAIL_COUNT -gt 5 ] && { echo "ERROR: Neon restore failed repeatedly"; exit 1; }
      ;;
  esac
  sleep 5
done
```

**Cleanup (success path):** On success, delete the snapshot branch via `DELETE /projects/{id}/branches/{snapshot_branch_id}`. This succeeds on the happy path.

**Important:** After a rollback that uses `preserve_under_name`, the snapshot branch may become undeletable (Neon does not allow deleting a branch that was used as a restore source when a backup was preserved). Do not attempt to delete the snapshot branch after a rollback — leave it for forensics. These branches will accumulate in the Neon project and should be periodically cleaned up manually.

### 5. ECS Init Container (Migration Sidecar)

The same Docker image runs both migration and the backend. Add a `migrate` container to both `config.stage.yaml` and `config.prod.yaml`:

```yaml
container_definitions:
  migrate:
    image: <ECR_TAG>           # same image as backend; updated by yq stump on each deploy
    essential: true            # MUST be true: a migration failure kills the task immediately
                               # (essential: false would delay failure detection by 210+ seconds)
    command: ["pnpm", "db:update"]
    linuxParameters:
      initProcessEnabled: True  # consistent with backend container; ensures clean subprocess reaping
    secrets:
      - name: DATABASE_URL
        valueFrom: <same ARN as backend's DATABASE_URL secret>
        # The ECS task execution role already has secretsmanager:GetSecretValue for send-suite/STACK/*
        # No new IAM policy needed for this.
  backend:
    image: <ECR_TAG>
    dependsOn:
      - containerName: migrate
        condition: SUCCESS      # backend will not start if migration exits non-zero
    portMappings: [...]
    linuxParameters:
      initProcessEnabled: True
    secrets: [...]
    environment: [...]
```

**Remove** `pnpm db:update` (line 18) from `packages/send/backend/scripts/entry.sh`. Leave `pnpm db:generate` (line 21) — it regenerates the Prisma client for the backend process on startup and should remain.

**Local development impact:** Removing `pnpm db:update` from `entry.sh` means developers running `docker compose up` locally will no longer have migrations applied automatically. Add a `migrate` service to `compose.ci.yml` (and document the same for local dev compose):

```yaml
services:
  migrate:
    image: send-backend
    command: ["pnpm", "db:update"]
    environment:
      DATABASE_URL: ${DATABASE_URL}
    depends_on:
      db:
        condition: service_healthy
  backend:
    depends_on:
      migrate:
        condition: service_completed_successfully
```

**Atomicity requirement:** The `config.stage.yaml` / `config.prod.yaml` changes (adding the `migrate` container) and the `yq` stump changes in `merge.yml` / `release.yml` (adding `migrate.image` to the merge) **must land in the same PR**. If the config adds `migrate` before the stump is updated, the migrate container will run the old image while the backend runs new code on every deploy between those two commits.

**Recovery from a dirty `_prisma_migrations` state:** If a migration was partially applied (e.g., an OOM-killed init container left a `failed` row in `_prisma_migrations`), all init containers will refuse to run with Prisma error `P3009`. Recovery requires manual intervention: connect to the database and run `prisma migrate resolve --rolled-back <migration_name>` (or restore from the Neon snapshot). This is documented here so engineers know the recovery path.

### 6. Pulumi Deploy (inside migration job)

Same Pulumi invocation as the existing deploy job. Because `desired_count=0` was set manually in the drain step, Pulumi will restore it to 2 as part of the `--target-dependents` service update:

```bash
pulumi up -y --diff --target \
  "urn:pulumi:STACK::send-suite::tb:fargate:FargateClusterWithLogging$aws:ecs/taskDefinition:TaskDefinition::send-suite-STACK-fargate-taskdef" \
  --target-dependents
```

### 7. Observability: Early Failure Detection

Do not rely solely on `aws ecs wait services-stable` — on migrate failure it hangs silently for up to 10 minutes before timing out. Add an early-detection polling loop immediately after Pulumi deploys:

```bash
# Poll for stopped tasks (indication of migrate container failure) before running the full waiter
for i in $(seq 1 20); do
  STOPPED=$(aws ecs list-tasks \
    --cluster $CLUSTER --desired-status STOPPED \
    --family send-suite-STACK-fargate-taskdef \
    --query 'length(taskArns)' --output text)
  RUNNING=$(aws ecs list-tasks \
    --cluster $CLUSTER --desired-status RUNNING \
    --family send-suite-STACK-fargate-taskdef \
    --query 'length(taskArns)' --output text)
  echo "Running: $RUNNING  Stopped: $STOPPED  (poll $i/20)"
  if [ "$STOPPED" -gt 0 ] && [ "$RUNNING" -eq 0 ]; then
    echo "ERROR: Tasks are stopping — migrate container likely failed."
    break
  fi
  [ "$RUNNING" -ge 2 ] && echo "Tasks healthy." && break
  sleep 15
done

# Full ECS stability waiter (10-minute ceiling; set job timeout-minutes >= 45 to cover this + rollback)
aws ecs wait services-stable --region eu-central-1 --cluster $CLUSTER --services $SERVICE
```

**Surface CloudWatch logs on failure** (add as `if: failure()` step):

```bash
# Get the most recently stopped task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster $CLUSTER --desired-status STOPPED \
  --family send-suite-STACK-fargate-taskdef \
  --query 'taskArns[0]' --output text)

if [ -n "$TASK_ARN" ] && [ "$TASK_ARN" != "None" ]; then
  TASK_ID=$(basename $TASK_ARN)
  LOG_STREAM="ecs/migrate/${TASK_ID}"
  echo "=== migrate container logs ==="
  aws logs get-log-events \
    --region eu-central-1 \
    --log-group-name "/ecs/send-suite-STACK-fargate" \
    --log-stream-name "$LOG_STREAM" \
    --limit 200 \
    --query 'events[*].message' --output text || echo "(log stream not found)"
fi
```

**Set `timeout-minutes` on the migration job.** The job can use up to three sequential `services-stable` waits (drain + forward deploy + rollback) plus Neon polling. Set:

```yaml
jobs:
  backend-migrate-stage:
    timeout-minutes: 45
```

### 8. Rollback (on failure)

Use `if: failure()` to trigger. Reference `PREV_TASK_DEF` via the step output set in section 3:

```bash
PREV_TASK_DEF="${{ steps.drain.outputs.prev_task_def }}"

if [ -z "$PREV_TASK_DEF" ]; then
  echo "ERROR: No previous task definition ARN captured. Cannot roll back ECS."
  echo "Manual recovery required: restore ECS service and re-enable autoscaling."
  exit 1
fi

# a) Restore Neon snapshot (must complete before ECS starts)
SNAPSHOT_BRANCH_ID="${{ steps.snapshot.outputs.snapshot_branch_id }}"
if [ -n "$SNAPSHOT_BRANCH_ID" ]; then
  # ... run restore + polling loop from section 4 ...
else
  echo "WARNING: No Neon snapshot branch ID available. Database schema may not be restored."
fi

# b) Roll back ECS to previous task definition
aws ecs update-service \
  --cluster $CLUSTER --service $SERVICE \
  --task-definition "$PREV_TASK_DEF" \
  --desired-count 2

aws ecs wait services-stable --region eu-central-1 --cluster $CLUSTER --services $SERVICE
```

**Pulumi state drift after rollback:** After `aws ecs update-service` reverts to the old task definition, Pulumi's state file still records the new (failed) task definition. The next `pulumi up` will detect this as drift and attempt to revert the ECS service back to the failed image. This is not self-healing.

**Required post-rollback recovery step** (run manually after rollback, before the next deploy):

```bash
cd packages/send/pulumi
export PULUMI_CONFIG_PASSPHRASE='...'
pulumi login
pulumi stack select STACK
pulumi refresh --yes  # imports current live AWS state into Pulumi's state file
# Then revert config.STACK.yaml image tags to the previous working version
# and commit before triggering a new deploy
```

**GitHub Release re-publish loop (prod only):** After a prod migration failure and rollback, the GitHub Release object remains published. Re-publishing the same release will re-trigger `release.yml` with the same broken image/migration — a loop. After a prod rollback, convert the release to a pre-release via the GitHub API to prevent accidental re-triggering:

```bash
gh release edit ${{ github.event.release.tag_name }} --prerelease
```

Add this as a `if: failure()` step in the prod migration job.

### 9. Autoscaler Cleanup (separate job — handles cancellation)

`if: failure()` steps do not fire when a job is cancelled. Because `concurrency: cancel-in-progress: true` is active in `merge.yml`, a second push can cancel the migration job mid-drain, leaving the service at `desired_count=0` with the autoscaler suspended indefinitely.

The fix is a **separate job** (`autoscaler-cleanup-stage` / `autoscaler-cleanup-prod`) that is always evaluated, even when its dependency is cancelled:

```yaml
autoscaler-cleanup-stage:
  needs: [backend-migrate-stage]
  if: always()
  runs-on: ubuntu-latest
  environment:
    name: send-stage
  steps:
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-region: eu-central-1
        # ...

    - name: Re-enable autoscaler and ensure desired_count >= 2
      run: |
        # Re-enable autoscaler suspend flags (min_capacity unchanged — avoids Pulumi drift)
        aws application-autoscaling register-scalable-target \
          --service-namespace ecs \
          --resource-id "service/${CLUSTER}/${SERVICE}" \
          --scalable-dimension ecs:service:DesiredCount \
          --suspended-state "DynamicScalingInSuspended=false,DynamicScalingOutSuspended=false,ScheduledScalingSuspended=false"

        # Ensure service is not stranded at 0 (handles cancelled-mid-drain case)
        CURRENT_DESIRED=$(aws ecs describe-services \
          --cluster $CLUSTER --services $SERVICE \
          --query 'services[0].desiredCount' --output text)
        if [ "$CURRENT_DESIRED" = "0" ]; then
          echo "Service is at 0 replicas — restoring desired_count to 2"
          aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 2
        fi
```

### 10. Frontend CDN Invalidation

#### Stage (`merge.yml`)

The `if:` condition must be written as a multi-line expression **without** the `${{ }}` wrapper (GitHub Actions supports bare expressions in `if:` fields). The existing line 342 uses `${{ }}` inline — the new multi-line form is equivalent and correct:

```yaml
frontend-invalidate-stage-cdn:
  needs: [detect-changes, frontend-deploy-stage-aws, backend-deploy-stage-aws, backend-migrate-stage]
  if: >-
    always()
    && needs.detect-changes.outputs.frontend-changed == 'true'
    && needs.frontend-deploy-stage-aws.result == 'success'
    && (
      needs.detect-changes.outputs.backend-changed != 'true'
      || needs.backend-deploy-stage-aws.result == 'success'
      || needs.backend-migrate-stage.result == 'success'
    )
```

**Atomicity requirement:** `backend-migrate-stage` must be defined in the workflow before this `needs` reference is added. Both changes must land in the same PR — adding a `needs` reference to a non-existent job causes the entire workflow to fail to parse.

#### Prod (`release.yml`)

The prod workflow uses step-level conditionals (`contains(github.event.release.assets.*)`) rather than job-level `if` conditions, so `backend-migrate-prod` always exits `success` (same as the current `backend-deploy-prod-aws` behavior). The prod CDN condition does **not** use `always()` — without it, a failing backend job automatically blocks the CDN via GitHub's default cascade behavior:

```yaml
frontend-invalidate-prod-cdn:
  needs: ["frontend-deploy-prod-aws", "backend-migrate-prod"]
  if: >-
    needs.frontend-deploy-prod-aws.outputs.s3_deployed == 'true'
    && (
      needs.backend-migrate-prod.outputs.ecs_deployed == 'true'
      || needs.backend-migrate-prod.outputs.ecs_deployed == ''
    )
```

The second clause (`ecs_deployed == ''`) handles frontend-only releases where no `ecr_tag.zip` was present and the backend step was skipped — the CDN should still fire.

---

## Files to Modify

| File | Change |
|------|--------|
| `.github/workflows/merge.yml` | Add `skip_migration` input; add `migration-changed` to both `paths-filter` and `outputs:` block; add `backend-migrate-stage` job; update `backend-deploy-stage-aws` condition; add `autoscaler-cleanup-stage` job; update `frontend-invalidate-stage-cdn` needs/condition |
| `.github/workflows/release.yml` | Replace `backend-deploy-prod-aws` with `backend-migrate-prod` job; add `autoscaler-cleanup-prod` job; update `frontend-invalidate-prod-cdn` condition (see explicit form above — do not use "same pattern as stage") |
| `packages/send/backend/scripts/entry.sh` | Remove `pnpm db:update` (line 18); leave `pnpm db:generate` (line 21) |
| `packages/send/pulumi/config.stage.yaml` | Add `migrate` init container; reduce `deregistration_delay` to 30s; add autoscaling IAM policy |
| `packages/send/pulumi/config.prod.yaml` | Same as stage |
| `compose.ci.yml` | Add `migrate` service; add `depends_on: migrate` to `backend` service |

---

## New Secrets / Variables Required

To be added in GitHub Settings → Environments (`send-stage`, `send-prod`). All Neon credentials are **per-environment** — do not use a repo-wide `NEON_API_KEY`.

| Name | Type | Environment | Notes |
|------|------|-------------|-------|
| `NEON_API_KEY` | secret | `send-stage` | Project-scoped Neon API key for the stage project only |
| `NEON_API_KEY` | secret | `send-prod` | Project-scoped Neon API key for the prod project only |
| `NEON_PROJECT_ID` | variable | `send-stage` | Neon project ID for stage |
| `NEON_PROJECT_ID` | variable | `send-prod` | Neon project ID for prod |
| `NEON_BRANCH_ID` | variable | `send-stage` | ID of the main database branch in the stage project |
| `NEON_BRANCH_ID` | variable | `send-prod` | ID of the main database branch in the prod project |

---

## Required Infrastructure Changes (before first deploy)

1. **CI IAM policy for Application Auto Scaling** — add a new IAM policy granting the CI user `application-autoscaling:RegisterScalableTarget` and `application-autoscaling:DescribeScalableTargets`. Wire it up via the `additional_policies` key in `config.stage.yaml` and `config.prod.yaml`. Without this, the suspend/re-enable steps fail with `AccessDenied`.

2. **ALB deregistration delay** — reduce from the AWS default (300s) to 30s in the Pulumi service config. This makes the drain step's 35s sleep sufficient and prevents unnecessarily long maintenance windows.

3. **ALB health check path** — the current `health_check` block in `config.stage.yaml` / `config.prod.yaml` has no explicit `path`, defaulting to `/`. The backend's actual health endpoint is `/api/health`. Set `path: /api/health` to ensure health checks accurately reflect backend readiness.

---

## Verification

1. Push a commit that adds a new migration file — confirm `migration-changed=true` in detect-changes; `backend-migrate-stage` runs; `backend-deploy-stage-aws` is skipped
2. Confirm ECS scales to 0, autoscaler is suspended (check AWS console), then Pulumi restores desired_count to 2
3. Confirm `migrate` container logs appear in CloudWatch under the task's log stream before `backend` starts
4. Confirm Neon console shows a `migration-snapshot-{run_id}` branch created and deleted on success
5. Confirm CDN invalidation fires after both backend and frontend deploys succeed
6. **Failure test:** Break the migration SQL — confirm CI surfaces CloudWatch logs within ~2 minutes (not 10), Neon branch is restored, ECS reverts to old task definition, `autoscaler-cleanup-stage` re-enables the autoscaler
7. **Cancellation test:** Trigger a migration run, cancel it mid-drain — confirm `autoscaler-cleanup-stage` fires independently and restores desired_count to 2
8. **Push a backend-only change (no migration)** — confirm normal `backend-deploy-stage-aws` path runs; no drain; no Neon snapshot
9. **Frontend-only prod release** — confirm CDN invalidation fires even with no `ecr_tag.zip` asset

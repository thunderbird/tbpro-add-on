# Database Migration CI Pipeline Design

**Date:** 2026-04-14  
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
2. **Drain** — scale ECS service to 0, suspend autoscaler to prevent it fighting us  
3. **Snapshot** — create a Neon branch from the live database before any DDL runs  
4. **Migrate** — Pulumi deploys a new task definition that includes a `migrate` init container; ECS starts tasks, init container runs `prisma migrate deploy` and exits, then `backend` starts (enforced via ECS `dependsOn`)  
5. **Verify** — `aws ecs wait services-stable` confirms healthy tasks  
6. **Re-enable** — autoscaler re-enabled; service traffic resumes naturally  
7. **Rollback (on any failure)** — restore Neon branch to snapshot LSN, revert ECS service to previous task definition revision  

For **frontend**: CloudFront invalidation already depends on backend deploy success. The `frontend-invalidate-*-cdn` jobs will be updated to also accept the new `backend-migrate-*` job as a valid backend success path.

---

## Architecture

### Job graph (merge.yml, stage)

```
detect-changes
  ├─ backend-build-stage          (if backend-changed)
  │    ├─ backend-migrate-stage   (if backend-changed && migration-changed) ← NEW
  │    └─ backend-deploy-stage-aws (if backend-changed && !migration-changed)
  ├─ frontend-build               (if frontend-changed)
  │    └─ frontend-deploy-stage-aws
  │         └─ frontend-invalidate-stage-cdn (depends on either backend job + frontend)
  └─ addon-changes                (if addon/frontend-changed)
```

`backend-migrate-stage` and `backend-deploy-stage-aws` are **mutually exclusive** — exactly one runs per push.

### Job graph (release.yml, prod)

```
[Release published]
  ├─ backend-migrate-prod         (if ecr_tag.zip asset present) ← replaces backend-deploy-prod-aws
  ├─ frontend-deploy-prod-aws     (if dist-web-prod.zip asset present)
  └─ frontend-invalidate-prod-cdn (depends on backend-migrate-prod + frontend-deploy-prod-aws)
```

For prod, the migration pipeline always runs when a backend is being deployed (safe default — `prisma migrate deploy` is a no-op if no pending migrations, and the snapshot/drain overhead is acceptable for production).

---

## Component Design

### 1. Migration Detection (stage only)

Add to `detect-changes` job in `merge.yml`:

```yaml
migration-changed:
  - 'packages/send/backend/prisma/migrations/**'
```

Output: `needs.detect-changes.outputs.migration-changed`

Stage conditions:
- `backend-migrate-stage`: `backend-changed == 'true' && migration-changed == 'true'`
- `backend-deploy-stage-aws`: `backend-changed == 'true' && migration-changed != 'true'`

### 2. Traffic Drain

Before any DDL runs, stop all traffic to the backend:

```bash
# 1. Suspend autoscaler (prevents min_capacity=2 fighting the scale-down)
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id "service/${CLUSTER}/${SERVICE}" \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 0 --max-capacity 4 \
  --suspended-state "DynamicScalingInSuspended=true,DynamicScalingOutSuspended=true,ScheduledScalingSuspended=true"

# 2. Record previous task definition ARN (for rollback)
PREV_TASK_DEF=$(aws ecs describe-services \
  --cluster $CLUSTER --services $SERVICE \
  --query 'services[0].taskDefinition' --output text)

# 3. Scale to 0 and wait for full drain
aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 0
aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE
```

### 3. Neon Snapshot

Two separate Neon projects: one for stage, one for prod.

**New GitHub secrets/variables (scoped to `send-stage` and `send-prod` environments):**

| Name | Type | Scope | Value |
|------|------|-------|-------|
| `NEON_API_KEY` | secret | repo-wide | Neon personal access token |
| `NEON_PROJECT_ID` | variable | per-environment | Neon project ID for that env |
| `NEON_BRANCH_ID` | variable | per-environment | ID of the main database branch |

**Create snapshot:**

```bash
SNAPSHOT_RESPONSE=$(curl -sfS -X POST \
  "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches" \
  -H "Authorization: Bearer ${NEON_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"branch\": {\"parent_id\": \"${NEON_BRANCH_ID}\", \"name\": \"migration-snapshot-${GITHUB_RUN_ID}\"}}")
SNAPSHOT_BRANCH_ID=$(echo "$SNAPSHOT_RESPONSE" | jq -r '.branch.id')
echo "snapshot_branch_id=$SNAPSHOT_BRANCH_ID" >> "$GITHUB_OUTPUT"
```

**Rollback (restore main branch to snapshot state):**

```bash
RESTORE_RESPONSE=$(curl -sfS -X POST \
  "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches/${NEON_BRANCH_ID}/restore" \
  -H "Authorization: Bearer ${NEON_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"source_branch_id\": \"${SNAPSHOT_BRANCH_ID}\", \"preserve_under_name\": \"failed-migration-${GITHUB_RUN_ID}\"}")
# Poll the operation to confirm completion
OPERATION_ID=$(echo "$RESTORE_RESPONSE" | jq -r '.operations[0].id')
# poll GET /projects/{id}/operations/{op_id} until status == "finished"
```

**Cleanup (success):** Delete snapshot branch via `DELETE /projects/{id}/branches/{snapshot_branch_id}`.

### 4. ECS Init Container (Migration Sidecar)

The same Docker image runs both the migration and the backend. Add a `migrate` container alongside `backend` in both `config.stage.yaml` and `config.prod.yaml`:

```yaml
container_definitions:
  migrate:
    image: <ECR_TAG>           # same image as backend
    essential: false
    command: ["pnpm", "db:update"]
    secrets:
      - name: DATABASE_URL
        valueFrom: <same ARN as backend's DATABASE_URL secret>
  backend:
    image: <ECR_TAG>
    dependsOn:
      - containerName: migrate
        condition: SUCCESS      # backend won't start if migration fails
    portMappings: [...]
    secrets: [...]
    environment: [...]
```

**Remove** `pnpm db:update` from `packages/send/backend/scripts/entry.sh`.

The `yq` merge step in both workflows also needs to update the `migrate` container's image in addition to `backend`:

```yaml
resources:
  tb:fargate:FargateClusterWithLogging:
    backend:
      task_definition:
        container_definitions:
          backend:
            image: "$ECR_TAG"
          migrate:
            image: "$ECR_TAG"
```

### 5. Pulumi Deploy (inside migration job)

The migration job calls Pulumi the same way as the existing deploy job — it registers the new task definition (now containing the migrate container) and updates the ECS service, which restores `desired_count` to 2 as declared in the config:

```bash
pulumi up -y --diff --target \
  "urn:pulumi:STACK::send-suite::tb:fargate:FargateClusterWithLogging$aws:ecs/taskDefinition:TaskDefinition::send-suite-STACK-fargate-taskdef" \
  --target-dependents
```

Then wait for stability:

```bash
aws ecs wait services-stable --region eu-central-1 \
  --cluster send-suite-STACK-fargate --services send-suite-STACK-fargate
```

### 6. Rollback (on failure)

Triggered by `if: failure()` step at the end of the migration job:

```bash
# a) Restore Neon snapshot (undo DDL)
# ... curl POST to restore API (see section 3) ...

# b) Roll back ECS to previous task definition revision
aws ecs update-service \
  --cluster $CLUSTER --service $SERVICE \
  --task-definition "$PREV_TASK_DEF" \
  --desired-count 2

aws ecs wait services-stable --cluster $CLUSTER --services $SERVICE
```

Note: Pulumi state will diverge temporarily after a rollback. The next successful deploy will reconcile it.

### 7. Re-enable Autoscaler

Always runs (even on failure, after rollback):

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id "service/${CLUSTER}/${SERVICE}" \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 4 \
  --suspended-state "DynamicScalingInSuspended=false,DynamicScalingOutSuspended=false,ScheduledScalingSuspended=false"
```

### 8. Frontend CDN Invalidation Update

`frontend-invalidate-stage-cdn` in `merge.yml` currently has:

```yaml
needs: [detect-changes, frontend-deploy-stage-aws, backend-deploy-stage-aws]
if: always() && ... && (backend-changed != true || backend-deploy-stage-aws.result == success)
```

Update `needs` to include `backend-migrate-stage` and update the `if` condition to accept either backend job succeeding:

```yaml
needs: [detect-changes, frontend-deploy-stage-aws, backend-deploy-stage-aws, backend-migrate-stage]
if: |
  always()
  && needs.detect-changes.outputs.frontend-changed == 'true'
  && needs.frontend-deploy-stage-aws.result == 'success'
  && (
    needs.detect-changes.outputs.backend-changed != 'true'
    || needs.backend-deploy-stage-aws.result == 'success'
    || needs.backend-migrate-stage.result == 'success'
  )
```

Same pattern for `frontend-invalidate-prod-cdn` in `release.yml` (replace `backend-deploy-prod-aws` dependency with `backend-migrate-prod`).

---

## Files to Modify

| File | Change |
|------|--------|
| `.github/workflows/merge.yml` | Add `migration-changed` to `detect-changes`; add `backend-migrate-stage` job; update `backend-deploy-stage-aws` condition; update `frontend-invalidate-stage-cdn` needs/condition |
| `.github/workflows/release.yml` | Replace `backend-deploy-prod-aws` with `backend-migrate-prod` job; update `frontend-invalidate-prod-cdn` |
| `packages/send/backend/scripts/entry.sh` | Remove `pnpm db:update` (migration moves to init container) |
| `packages/send/pulumi/config.stage.yaml` | Add `migrate` init container to `container_definitions` |
| `packages/send/pulumi/config.prod.yaml` | Add `migrate` init container to `container_definitions` |

---

## New Secrets / Variables Required

To be added in GitHub Settings → Environments (`send-stage`, `send-prod`):

| Name | Type | Notes |
|------|------|-------|
| `NEON_API_KEY` | secret | Neon personal access token (or project-scoped key) |
| `NEON_PROJECT_ID` | variable | Different value per environment |
| `NEON_BRANCH_ID` | variable | ID of the main database branch per environment |

---

## Verification

1. Push a commit that adds a new migration file to `prisma/migrations/` along with a backend code change
2. Observe `merge.yml` run: `detect-changes` outputs `migration-changed=true`; `backend-migrate-stage` runs; `backend-deploy-stage-aws` is skipped
3. In AWS Console, confirm ECS service scaled to 0, then back to 2 with new task definition
4. In ECS task logs, confirm `migrate` container ran `prisma migrate deploy` successfully before `backend` container started
5. In Neon console, confirm a `migration-snapshot-{run_id}` branch was created (and deleted on success)
6. Confirm frontend CDN was invalidated after both backend and frontend deploys succeeded
7. Force a failure (e.g., break the migration SQL) and confirm: ECS rolls back to previous task def, Neon branch is restored, service recovers

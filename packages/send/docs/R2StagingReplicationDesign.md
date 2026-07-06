# Design Note: R2 Staging → B2 Replication for Send

Status: **Draft for review** — design-first deliverable for
[thunderbird/tbpro-add-on#959](https://github.com/thunderbird/tbpro-add-on/issues/959).
No production code changes accompany this note; it selects and specifies an
implementation approach, pending three blocking prototypes (§3, Phase 0) and the
human decisions in §6. The option analysis and cost model behind this choice
live in the companion note [R2StagingFeasibility.md](./R2StagingFeasibility.md).

**Background.** Production uploads to Backblaze B2 fail with `UPLOAD_FAILED`
connection stalls on long-haul client paths (e.g. Costa Rica → `eu-central-003`):
the PUT stalls mid-transfer with no HTTP status, retries exhaust, and the upload
hard-fails (see #959; #913 analyzes the same stall for the resumable-upload
track). This design terminates the client PUT at Cloudflare's nearby edge (R2),
so the fragile long-haul hop rides Cloudflare's backbone instead, then
asynchronously replicates to B2 — which remains the serving tier.

All platform claims (limits, behaviors, pricing) were verified against
official vendor documentation on 2026-07-06; claims that could not be verified
on paper are explicitly marked ⚠ and gated on the Phase 0 prototypes (§7).

**One-paragraph summary.** Uploads stay **B2-first**: the client PUTs to the B2 presigned URL as today, and only after its existing retry budget fails does it request an R2 presigned URL and retry there (per maintainer direction on #959 — this proves R2 resolves B2 failures with a built-in per-upload control, keeps the majority of traffic on the direct path, and cuts R2 volume/cost to the failing fraction; the server-side gate can widen to region-based or full R2 routing later if the data supports it). Objects that land in R2 replicate **push-fashion, immediately**: the R2 object-create event feeds a Cloudflare Queue; a consumer Worker verifies the DB row exists, streams the object R2→B2 with server-side integrity checks, calls an HMAC-authenticated backend endpoint to flip `Upload.storageLocation` from `r2` to `b2`, then enqueues a short grace-period delete of the staging object. Expected R2 residency is **minutes** (copy latency + 1 h grace) — the multi-day lifecycle rule is an orphan fuse, not the normal path. Downloads presign from whichever provider the row points at. Postgres is the single source of truth; every queue message is a regenerable hint, backstopped by a backend reconciliation sweep and the lifecycle rule.

---

## 1. Architecture overview

```
                        THUNDERBIRD ADD-ON / WEB CLIENT (Vue, packages/send/frontend + packages/addon)
                        │
                        │ 0. PUT to B2 presigned URL (today's path). On retry-budget exhaustion only:
                        │ 1. POST /api/uploads/signed {type, size, capabilities:['r2'], fallback:true}
                        ▼
   ┌────────────────────────────────────┐
   │ BACKEND (Express/tRPC/Prisma,      │ 2. r2Gate(uniqueHash)? → presign PUT on R2 staging
   │ ECS Fargate eu-central-1, 2 tasks) │    else → presign PUT on B2 (also the permanent old-client path)
   └────────────────────────────────────┘
                        │ returns {id, url, bucket}
                        ▼
        3. client XHR PUT (E2E-encrypted ~100MB part) ──────────► R2 BUCKET send-staging-{env}  (jurisdiction=eu)
                        │                                              │
        4. POST /api/uploads {id, size, bucket:'r2'}                   │ 5. event notification: object-create (PutObject)
           → createUpload(): HeadObject on R2, row created             ▼
             with storageLocation='r2'                        QUEUE send-{env}-r2-events ──(DLQ: send-{env}-r2-dlq,
                        ▲                                              │                     alert-and-ack consumer)
                        │                                              ▼ push consumer, batch=1
                        │                              ┌───────────────────────────────┐
   6. GET  /api/internal/uploads/:id  (HMAC) ◄─────────│ COPIER WORKER                 │
      404 → retry/orphan-ack;  'b2' → ack;  'r2' ↓     │ packages/send/copier          │
                                                       │ R2 binding get() →            │
   7. stream copy: R2 ReadableStream ──────────────────│ FixedLengthStream →           │──► B2 BUCKET (send-{env},
      FixedLengthStream(size) + Content-MD5 from R2    │ aws4fetch (retries: 0)        │    s3.eu-central-003)
      → B2 verifies MD5 server-side, size HEAD-checked │ SigV4 PUT (UNSIGNED-PAYLOAD)  │
                                                       └───────────────────────────────┘
   8. POST /api/internal/uploads/:id/flip (HMAC) ◄─────────────┘
      CAS: storageLocation r2→b2 (+B2 HeadObject re-verify)
                        │
                        │ 9. Worker enqueues {DeleteStaged, key} → QUEUE send-{env}-r2-deletes, delaySeconds=3600 (1h)
                        ▼
   10. delete consumer: row=='b2'? + B2 HEAD ok? → R2 DeleteObject (staging copy gone)

   DOWNLOADS (unchanged route): GET /api/download/:id/signed → presign GET from row.storageLocation
   (R2 pre-flip — egress free; B2 post-flip)

   BACKSTOPS: R2 lifecycle (delete objects @7d, abort multipart @1d)
              backend reconciliation sweep every 15min: rows stuck 'r2' >1h → re-enqueue via Queues HTTP API
              Sentry alert if any row stuck 'r2' >24h
```

### Component inventory

| # | Component | Where | New/changed |
|---|---|---|---|
| 1 | Client capability flag + bucket echo | `packages/send/frontend/src/lib/{filesync,upload}.ts`, chat components | changed |
| 2 | Backend storage provider registry (R2+B2+fs, drop tweedegolf) | `packages/send/backend/src/storage/` | rewritten |
| 3 | Prisma `StorageLocation` enum + `migratedAt` + index | `packages/send/backend/prisma/schema.prisma:138-150` | migration |
| 4 | `uploads/signed` gate (kill switch + % rollout) | `backend/src/routes/uploads.ts:162-178` | changed |
| 5 | Internal HMAC router (precheck / flip / dead-letter) | `backend/src/routes/internal.ts` (new), mounted at `backend/src/index.ts:133-144` | new |
| 6 | Location-aware downloads + dual-store delete | `backend/src/routes/download.ts`, `backend/src/models.ts:264-272`, `backend/src/models/sharing.ts:738-742` | changed |
| 7 | Reconciliation sweep | `backend/src/jobs/reconcileStaged.ts` (new) | new |
| 8 | Copier Worker (3 queue consumers) | `packages/send/copier/` (new pnpm workspace member) | new |
| 9 | Cloudflare infra: bucket, CORS, lifecycle, 3 queues, notification rule | `packages/send/pulumi/cloudflare_r2.py` (new) — see §2.5 for the Pulumi-vs-wrangler decision | new |
| 10 | CI: worker validate/deploy jobs, secrets | `.github/workflows/{validate,merge,release}.yml` | changed |
| 11 | CSP updates (two sources of truth) | `frontend/csp.config.js` + `pulumi/config.{stage,prod}.yaml` `frontend-csp-header` | changed |
| 12 | Sentry URL scrubbing (bearer presigned URLs must never reach telemetry — ship first, independently) | `frontend/src/lib/sentry.ts:11-31`, `backend/src/sentry.ts:30-32` | changed |

---

## 2. Per-component design

### 2.1 Copier Worker (`packages/send/copier/`)

**Runtime dependency: `aws4fetch` only** (6.4 kB; verified: when `X-Amz-Content-Sha256` is pre-set it is used verbatim and the body is never inspected, so a `ReadableStream` body flows straight to `fetch()`). No `@aws-sdk/client-s3` in the Worker — this sidesteps the v3.729+ CRC32-checksum headers that B2 rejects. One sharp edge: **`AwsClient` defaults to `retries: 10`**, and an internal retry would re-send an already-consumed `ReadableStream` (surfacing as an opaque `TypeError` on the first transient B2 5xx/429). Construct with `retries: 0` — the queue is the retry mechanism.

**Load-bearing pipeline** (all links verified against July-2026 docs except the two marked ⚠, which are exactly what Prototype 2 tests):

R2 binding `get()` → `R2ObjectBody` with `body: ReadableStream`, `size`, and `checksums.md5` (present by default for all **non-multipart** objects — our client does single presigned PUTs) → `FixedLengthStream(obj.size)` (documented: becomes `Content-Length`, avoids chunked encoding, errors on byte-count mismatch — mandatory because B2's native API rejects chunked TE ⚠ *S3-layer inheritance is inference-grade*) → `aws4fetch` SigV4 PUT (`retries: 0`) with `x-amz-content-sha256: UNSIGNED-PAYLOAD` (production's own presigned PUTs already run UNSIGNED-PAYLOAD in the query form; P2 asserts the header form) and `Content-MD5` copied from R2's stored checksum, so **B2 itself verifies the received bytes server-side**; the same MD5 travels to the flip payload for the backend's independent ETag comparison. There is no digesting in the hot path — integrity rides R2's stored checksum plus B2's server-side verification — and never `tee()` a 100 MB stream in a 128 MB isolate (per WHATWG spec, tee buffers the slower branch unboundedly); the multipart fallback's pass-1 digest pipes through `DigestStream` alone.

```ts
// packages/send/copier/src/copy.ts — core (illustrative)
const obj = await env.STAGING.get(key);
if (!obj) return { outcome: 'gone' };                    // choreography decides: heal, or terminal-fail (see below)
const md5 = obj.checksums.md5;                           // ArrayBuffer; absent only for multipart (out-of-contract)
const body = obj.body.pipeThrough(new FixedLengthStream(obj.size));
const b2 = new AwsClient({ accessKeyId: env.B2_APPLICATION_KEY_ID,
  secretAccessKey: env.B2_APPLICATION_KEY, service: 's3', region: 'eu-central-003',
  retries: 0 });                                         // default 10 would re-send a consumed stream; the queue owns retries
const headers: Record<string,string> = {
  'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
  'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
};
if (md5) headers['content-md5'] = btoa(String.fromCharCode(...new Uint8Array(md5)));
const res = await b2.fetch(`${env.B2_ENDPOINT}/${env.B2_BUCKET}/${encodeURIComponent(key)}`,
  { method: 'PUT', headers, body });
if (!res.ok) throw new RetryableError(`B2 PUT ${res.status}`);
// then: HEAD B2, assert content-length === obj.size; pass hex(md5) + B2's PutObject ETag in the flip payload
```

**Multipart fallback (first-class, not afterthought):** verified corollary — R2 objects uploaded via multipart have **no** `checksums.md5`. If `checksums.md5` is absent (event `action === 'CompleteMultipartUpload'`, out-of-contract client): two-pass — pass 1 pipes through `DigestStream('MD5')` only (one extra free-tier-cheap Class B read), pass 2 re-`get()`s and uploads with the computed `Content-MD5`. Log loudly.

**Consumer choreography — check-first** (copy-first was rejected because abandoned uploads would waste 100 MB copies + need a B2 janitor, and invariant I6 requires that abandoned PUTs never produce a *lasting* B2 write). Two paths are deliberately B2-aware: the aged-404 path must not assume "no copy was ever made" (a prior attempt may have completed the B2 PUT and died before the flip — acking blind would strand a permanent B2 orphan of a possibly-deleted file), and the `'gone'` path must not ack without a terminal state (post-restore desync would otherwise livelock the sweep):

```ts
// on send-{env}-r2-events message {account, action, bucket, object:{key,size,eTag}, eventTime}
// NOTE: delete events omit size/eTag; create events may carry copySource — parse defensively.
const row = await hmacGet(env, `/api/internal/uploads/${key}`);
if (row.status === 404) {
  const age = Date.now() - Date.parse(msg.body.eventTime);
  if (age > 24*3600e3) {                                 // abandoned upload — but never assume "no copy was made":
    await hmacPost(env, '/api/internal/dead-letter',     //   backend HEADs B2 and deleteEverywhere()s any orphan a
      { key, reason: 'aged-404' });                      //   died-mid-flip attempt left behind (worker key can't delete)
    return msg.ack();                                    // R2 side drains via lifecycle
  }
  return msg.retry({ delaySeconds: Math.min(30 * 2 ** msg.attempts, 7200) });   // event-before-row race;
}                                                        // 2h cap keeps the 24h branch reachable inside max_retries=25
const { storageLocation } = await row.json();
if (storageLocation !== 'r2') return msg.ack();          // 'b2' duplicate, or 'failed' (human-gated) → ack
const r = await copyToB2(env, key);                      // §above; throws → retry w/ backoff
if (r.outcome === 'gone') {                              // row says 'r2' but staging object is missing:
  const b2 = await headB2(env, key);
  if (b2.ok) {                                           //   durable copy already exists (e.g. Postgres restored to a
    await hmacPost(env, `/api/internal/uploads/${key}/flip`, { md5: null });   // pre-flip snapshot) → auto-heal
    return msg.ack();
  }
  await hmacPost(env, '/api/internal/dead-letter',       //   truly gone: backend CAS r2→failed + Sentry — a terminal
    { key, reason: 'staging-gone' });                    //   state, so the sweep stops re-enqueueing (no livelock)
  return msg.ack();
}
const flip = await hmacPost(env, `/api/internal/uploads/${key}/flip`,
  { from:'r2', to:'b2', size:r.size, md5:r.md5Hex, b2ETag:r.b2ETag });
switch (flip.status) {
  case 200: await env.DELETE_QUEUE.send({ key }, { delaySeconds: 3600 }); return msg.ack();
  case 410: return msg.ack();      // row deleted mid-copy: BACKEND deletes the B2 orphan (see §2.3) — worker key has no delete
  case 409: return msg.ack();      // CONFIRMED short/corrupt copy: backend CAS'd r2→failed + recurring Sentry alerts
  case 503: return msg.retry({ delaySeconds: 600 });     // backend could not VERIFY (transient B2 HEAD failure) — row stays 'r2'
  case 401: return msg.retry({ delaySeconds: 3600 });    // secret rotation heals in place
  default:  return msg.retry({ delaySeconds: Math.min(30 * 2 ** msg.attempts, 10800) });
}
```

**Grace-delete consumer** (`send-{env}-r2-deletes`): HMAC precheck says row is `b2` (row absent → ack: `deleteEverywhere` already ran) **and** B2 `HeadObject` size matches → `env.STAGING.delete(key)` (free, idempotent). Any check fails → retry. *The only destructive op in the Worker is an R2-staging delete gated on confirmed B2 presence.* Grace = 1 h: the floor is the 1 h presigned-GET expiry (an R2 GET presigned an instant before the flip must outlive the delete), and maintainer direction on #959 is to keep Cloudflare residency to minutes — so the grace sits exactly at that floor. Comfortably under the verified 24 h `delaySeconds` cap.

**DLQ (`send-{env}-r2-dlq`): alert-and-ack.** Consumer POSTs a summary to `/api/internal/dead-letter` (→ Sentry) and acks. Safe because the DB is the source of truth and the sweep (§2.3) regenerates any real work from `storageLocation='r2'` rows. Attaching a consumer also neutralizes the verified platform trap that unconsumed DLQ messages persist only 4 days.

**wrangler.toml** (one script, wrangler environments; queue names frozen as API surface):

```toml
name = "send-copier"
main = "src/index.ts"
compatibility_date = "2026-06-01"
[limits]
cpu_ms = 60000                      # SHA-256 over 100MB ≈ 0.5s; queue-consumer CPU default is 30s — raise explicitly

[env.prod]
name = "send-copier-prod"
[[env.prod.r2_buckets]]
binding = "STAGING"
bucket_name = "send-staging-prod"
jurisdiction = "eu"                 # required in the binding for EU-jurisdiction buckets (verified)
[[env.prod.queues.consumers]]
queue = "send-prod-r2-events"
max_batch_size = 1                  # one ~100MB copy per invocation: full 15-min wall clock, clean per-object retry
max_retries = 25                    # + in-code exponential backoff to 3h cap ≈ 52h of coverage before DLQ
dead_letter_queue = "send-prod-r2-dlq"
max_concurrency = 20                # protects B2 + backend; platform allows 250
[[env.prod.queues.consumers]]
queue = "send-prod-r2-deletes"
max_batch_size = 10
max_retries = 10
dead_letter_queue = "send-prod-r2-dlq"
[[env.prod.queues.consumers]]
queue = "send-prod-r2-dlq"
max_batch_size = 10
max_retries = 5
[[env.prod.queues.producers]]
binding = "DELETE_QUEUE"
queue = "send-prod-r2-deletes"
[env.prod.vars]
B2_ENDPOINT = "https://s3.eu-central-003.backblazeb2.com"
B2_BUCKET   = "<prod B2 bucket — from pulumi config>"
BACKEND_URL = "https://send-backend.tb.pro"
# secrets via wrangler: B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, COPIER_HMAC_SECRET
```

**Budgets (verified limits):** 128 MB isolate — streaming keeps residency at chunk granularity ⚠ *provided outbound `fetch()` doesn't buffer the request body: undocumented, Prototype 2's 150 MB case is the proof*. Wall clock 15 min/invocation vs expected 20–90 s per copy. At 50 TB/mo (~525k objects, ~0.2/s), a 100× burst drains at 20 concurrent in minutes; platform caps (5,000 msg/s, 25 GB backlog, 250 concurrency) are orders of magnitude away.

### 2.2 Event plumbing (R2 → Queues)

- **Notification rule:** object-create only, actions `PutObject` + `CompleteMultipartUpload`, no prefix filter (single-purpose bucket). Do **not** subscribe `CopyObject` or object-delete (our own grace delete would echo). ⚠ Docs never state that presigned PUTs fire events, nor any delivery guarantee/latency for event *generation* — Prototype 1 confirms the firing; the sweep is the correctness mechanism for loss.
- **Retention:** set all three queues to the 14-day max (default is 4 days) so bringup ordering and long incidents never expire messages.
- **Ordering:** Queues is verified at-least-once, explicitly non-FIFO. Fine: 1 message = 1 independent object (parts are separate `Upload` rows — `prisma/schema.prisma:146` `part Int?`), and every consumer action is idempotent or self-verifying.

### 2.3 Backend

**Prisma migration** (`schema.prisma:138-150`):

```prisma
enum StorageLocation { r2 b2 failed }
model Upload {
  // ...existing fields
  storageLocation StorageLocation @default(b2)   // backfills every legacy row for free
  migratedAt      DateTime?
  @@index([storageLocation, createdAt])          // serves the sweep
}
```

`failed` marks a **confirmed** integrity problem only (backend-verified short/corrupt/missing B2 copy) — a transient verification error (e.g. a momentary B2 HEAD failure) returns 503 and leaves the row `r2` so the queue retries; it must never poison a row. `failed` rows keep serving downloads from R2, are excluded from the sweep's re-enqueue, and **re-alert on a recurring schedule** until a human redrives or deletes them — a `failed` row silently aging into the staging-lifecycle fuse would be data loss of a possibly fully-copied file, so the alerting is load-bearing, not cosmetic. No `migrating` state — the backend never observes an in-flight copy. No `attempts` column — Queues tracks attempts natively.

Migration mechanics: the enum + column + `@default(b2)` are metadata-only on PostgreSQL 11+ (**verify the prod RDS version before relying on this**). The index must **not** ship inside the same Prisma migration — Prisma emits a plain `CREATE INDEX`, which SHARE-locks `Upload` for the scan and stalls all writes mid rolling deploy. Create it out-of-band with `CREATE INDEX CONCURRENTLY` (and consider a partial index `WHERE "storageLocation" = 'r2'` — the sweep only ever reads that slice).

**Provider registry** (rewrite of `backend/src/storage/index.ts`; delete `storage/s3b2.ts`, `@tweedegolf/storage-abstraction`, and the 12 h token `setInterval` at `storage/index.ts:79-87` including its `directClient` re-attach race):

```ts
// backend/src/storage/provider.ts
export interface StorageProvider {
  getUploadUrl(key: string, contentType: string, size: number): Promise<string>;  // presigned PUT, 1h
  getDownloadUrl(key: string): Promise<string>;
  set(key: string, stream: Readable, size?: number): Promise<boolean>;
  get(key: string): Promise<Readable>;
  length(key: string): Promise<number>;
  del(key: string): Promise<boolean>;
}
export function getStorage(loc: 'r2' | 'b2' | 'failed'): StorageProvider {
  if (process.env.STORAGE_BACKEND === 'fs') return fsProvider;      // dev/CI: everything collapses to fs
  return loc === 'b2' ? b2 : r2;                                    // 'failed' rows still live in R2
}
```

B2 client config **must** carry `requestChecksumCalculation: 'WHEN_REQUIRED'` and `responseChecksumValidation: 'WHEN_REQUIRED'` (AWS officially documents the v3.729+ CRC32 default; B2 rejection is field-evidenced; the setting is a no-op if B2 has since fixed it — cite `docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html`, *not* the pingvin-share issue). R2 client: `endpoint = https://<acct>.eu.r2.cloudflarestorage.com` (EU jurisdiction, §6), `forcePathStyle: true` (single exact CSP entry). Note: the 2024-06-01 "B2 S3 API errors" comment at `storage/index.ts:42-43` is stale — presigning has run through B2's S3 API in prod ever since; still, prove `set/get/del` via the existing cred-gated `test/storage/backblaze.test.ts` before deleting tweedegolf.

Exhaustive call-site list: `routes/uploads.ts:171` (presign via registry), `routes/uploads.ts:38-45,98-105` (schema + bucket pass-through), `models/uploads.ts:28,38-48,58` (location-aware length check, persist column, `statUpload`), `routes/download.ts:20,22,75` (row lookup then provider), `models.ts:266` + `models/sharing.ts:740` (`deleteEverywhere`), `wsUploadHandler.ts:81` (`getStorage('b2').set`), storage tests rewritten to construct providers directly.

**Capability gate — B2-first, R2 on fallback** (`routes/uploads.ts:162-178`; routing mode per maintainer direction on #959):

```ts
const { uniqueHash } = getDataFromAuthenticatedRequest(req);
const wantsR2 = Array.isArray(req.body.capabilities) && req.body.capabilities.includes('r2');
const isFallback = req.body.fallback === true;           // client exhausted its B2 retry budget for this part
const bucket = wantsR2 && r2Mode(uniqueHash, isFallback) ? 'r2' : 'b2';
const url = await getStorage(bucket).getUploadUrl(uploadId, type, size);
return res.json({ id: uploadId, url, bucket });

function r2Mode(uniqueHash: string, isFallback: boolean): boolean {
  const mode = process.env.UPLOADS_R2_MODE ?? 'off';     // off | fallback | all — the kill switch stays one env flip away
  if (mode === 'off') return false;
  if (mode === 'all') return gatePct(uniqueHash);        // future widening (region cohorts / full routing) if the data supports it
  return isFallback && gatePct(uniqueHash);              // launch mode: R2 only after B2 has actually failed
}
```

- **Fallback choreography (client):** `uploadWithTracker` PUTs to B2 exactly as today; when its existing retry budget (`UPLOAD_HTTP_RETRY_LIMIT`) exhausts, `sendBlob` requests a second signed URL with `fallback: true` and retries the same encrypted blob against R2. Every upload taking this path is a **built-in per-upload A/B pair** — the same file, client, and network just failed on B2, then did-or-didn't succeed on R2 — the conclusive evidence the maintainers asked for, collected continuously in production rather than in a one-off canary.
- This collapses the R2 cost surface to the *failing fraction* of traffic and keeps the majority of uploads on today's direct single-hop path.
- Old clients send no `capabilities` → B2 forever (system add-on rides Thunderbird ESR — the B2 path is **permanent**).
- Client echoes `bucket` into `POST /api/uploads` (`createUploadSchema` gains `bucket: z.enum(['r2','b2']).default('b2')`); the echo is self-verifying — `createUpload`'s length check (`models/uploads.ts:28`) runs `getStorage(bucket).length(id)`, so a lying client fails HeadObject on the claimed provider. (Server-side re-derivation was rejected: a kill-switch flip between the two requests would strand a completed R2 PUT.)
- **Content-Length pinning (hardening):** `/signed` now requires the **encrypted** size — `calculateEncryptedSize(blob.size)`, deterministic and already used by the client at `filesync.ts:141`; storage holds ECE ciphertext, which is strictly larger than the plaintext, so pinning or comparing the plaintext number would reject every legitimate upload. The presign signs `ContentLength` via `signableHeaders: new Set(['content-type','content-length'])`, `checkStorageLimit` runs against the same value, and `createUpload` checks `sizeOnDisk == calculateEncryptedSize(size)` (today's check is `>=`). `Upload.size` keeps its plaintext semantics so quota accounting and size display don't shift. ⚠ R2's enforcement of a signed content-length on presigned PUT is documented nowhere official — Prototype 1 assertion (d); if refuted, the exact-size `createUpload` check is the enforcement point.

**Internal HMAC router** (`backend/src/routes/internal.ts`, new; mounted beside the others at `index.ts:133-144`, before the 404 catch-all at `:152`, with its own `express.raw({ type: 'application/json', limit: '16kb' })` — the global `express.json` at `index.ts:54` is not byte-stable for signing — plus `express-rate-limit` scoped to this router — the route set is Worker-only, so the budget can be tight):

Wire format: `x-tbsend-keyid`, `x-tbsend-timestamp` (unix ms), `x-tbsend-signature = hex(HMAC-SHA256(secret[keyid], `${method}\n${path}\n${timestamp}\n${sha256hex(rawBody)}`))`; reject if `|now − ts| > 300s`; compare with `crypto.timingSafeEqual`. Key-id enables two-secret zero-downtime rotation (`COPIER_HMAC_SECRET` + `_PREVIOUS`).

Routes:
- `GET /api/internal/uploads/:id` → `{ storageLocation }` or 404. (Worker precheck.)
- `POST /api/internal/uploads/:id/flip` — the pointer flip. The backend verifies against **its own** B2 HeadObject and treats the caller's payload as advisory, so a forged request cannot flip an uncopied upload to `b2`. It *can* still force a copied upload into `failed` (recoverable — that is what the recurring `failed` alerts and redrive runbook exist for); see the `COPIER_HMAC_SECRET` blast radius in §2.5. Critically, the handler distinguishes **transient** verification failures (503 — row untouched, queue retries) from **confirmed** mismatches (409 — `failed`): a momentary B2 blip must never poison a fully-copied upload into a state the lifecycle can eat.

```ts
router.post('/uploads/:id/flip', requireCopierHmac, wrapAsyncHandler(async (req, res) => {
  const { id } = req.params; const { md5 } = JSON.parse(req.body);   // caller payload is ADVISORY only
  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) {                                   // precheck saw the row → user deleted mid-copy
    await deleteEverywhere(id);                    // backend (full B2 key) removes the fresh B2 orphan + staging
    return res.status(410).json({});
  }
  let head;
  try {
    head = await getStorage('b2').head(id);        // the backend's OWN verification — never the caller's numbers
  } catch (e) {
    return res.status(503).json({});               // TRANSIENT verify failure: row stays 'r2', queue retries
  }
  const expected = calculateEncryptedSize(Number(upload.size));      // storage holds ECE ciphertext (see §2.3 pinning)
  const md5Mismatch = !!(head.eTag && md5 && head.eTag !== md5);     // single-part ETag == MD5, gated on P2 assertion 7
  if (head.length < expected || md5Mismatch) {     // CONFIRMED short/corrupt copy
    await prisma.upload.updateMany({ where: { id, storageLocation: 'r2' },
      data: { storageLocation: 'failed' } });
    Sentry.captureMessage(`upload ${id} flip integrity mismatch`);   // 'failed' rows re-alert recurringly (sweep)
    return res.status(409).json({});
  }
  const r = await prisma.upload.updateMany({       // atomic CAS: absorbs at-least-once duplicates & double-flip races
    where: { id, storageLocation: 'r2' },
    data: { storageLocation: 'b2', migratedAt: new Date() } });
  return res.status(200).json({ status: r.count ? 'flipped' : 'already-b2' });
}));
```

  (HMAC over Cloudflare Access service tokens / mTLS: Access requires fronting the API through Cloudflare's proxy — the zone's DNS is on Cloudflare but traffic ingresses via CloudFront/ALB, so re-fronting is a material infra change for no gain over HMAC + backend-owned verification.)
- `POST /api/internal/dead-letter` → log + `Sentry.captureMessage` (Sentry wired at `index.ts:9,156`). Two structured reasons get active handling beyond logging: **`aged-404`** — no row exists; the backend HEADs B2 and `deleteEverywhere()`s any orphan a died-between-copy-and-flip attempt left behind (the Worker's key deliberately cannot delete); and **`staging-gone`** — the row reads `r2` but the staging object is gone and B2 holds no copy; the backend CASes `r2→failed` + alerts, giving the sweep a terminal state instead of a re-enqueue livelock.

**Ordering dependency:** `createUpload` (`models/uploads.ts:28`) must run its length check against **R2** for `bucket='r2'` uploads — at `POST /api/uploads` time the object is R2-only.

**Downloads** (`routes/download.ts:61-83`): look up the row, `getStorage(row.storageLocation).getDownloadUrl(id)`. Files are downloadable the instant the PUT finishes (pre-flip GETs come from R2 — egress free); post-flip the 1 h grace (= presigned-GET expiry) makes in-flight presigned R2 GETs safe. Behavior note: `/:id/signed` already performs a DB read via `checkIdAgainstSuspiciousFiles` (`download.ts:66-73` — a `findUnique` whose destructuring throws on unregistered ids today, surfacing as a 5xx); the location lookup turns that into an intentional 404. The suspicious-files gate itself is DB-side and provider-agnostic — unchanged.

**Dual-store delete** — replaces `storage.del(id)` at `models.ts:266` and `models/sharing.ts:740`:

```ts
export async function deleteEverywhere(id: string): Promise<void> {
  const results = await Promise.allSettled(
    [...new Set([getStorage('b2'), getStorage('r2')])].map((p) => p.del(id)));
  if (results.some((r) => r.status === 'rejected')) throw new BaseError(UPLOAD_NOT_DELETED_FROM_STORAGE);
}
```

(S3 DeleteObject returns 204 for absent keys — no existence branching; the Set dedupes in fs mode; `UPLOAD_NOT_DELETED_FROM_STORAGE` at `errors/models.ts:26-27` keeps meaning "a provider errored".)

**Reconciliation sweep** (`backend/src/jobs/reconcileStaged.ts`, `setInterval` precedent: the old token renewer): every 15 min, `findMany({ where: { storageLocation: 'r2', createdAt: { lt: now-1h } }, take: 100 })` → re-enqueue synthetic R2-event-shaped messages via the verified Queues HTTP push API (`POST /accounts/{acct}/queues/{queue_id}/messages`, Queues-Edit token — note: the path takes the queue **UUID**, not the name — store the ID in config). The same cycle emits a **backlog gauge** — count and max age of `r2` rows — with graduated thresholds (warn at >500 rows or >6 h; page at >24 h), giving early warning of B2 degradation long before the page fires, and **re-alerts on `failed` rows recurringly** (they are excluded from re-enqueue but must never age out silently — see §2.3). Both Fargate tasks run it; duplicates are harmless (consumer precheck dedupes on `storageLocation`). Rejected: copying from the backend directly (public-subnet ECS → B2 traffic pays AWS DTO at $0.09/GB — the entire reason the copier lives on Cloudflare).

**Sentry URL scrubbing (ship first, independent):** presigned upload/download URLs are bearer secrets and must never reach telemetry. Scrub query strings on `r2.cloudflarestorage.com|backblazeb2.com` in `beforeBreadcrumb` and `beforeSend`, **and in `beforeSendTransaction`** — at `tracesSampleRate: 0.5`, `http.client` spans record full request URLs, so breadcrumb scrubbing alone leaves the tracing path open; disable or scope session-replay network capture for storage hosts; the backend's `captureConsoleIntegration` (`backend/src/sentry.ts:30-32`) gets the same scrub. Sentry's server-side data-scrubbing rules on `X-Amz-*` query params are a useful zero-deploy stopgap. Specifics are tracked in the private issue tracker.

### 2.4 Client (`packages/send/frontend`, shared with `packages/addon`)

- `filesync.ts:154-186` (`sendBlob`): send `capabilities: ['r2']` and the **encrypted** size (`calculateEncryptedSize(blob.size)` — already computed at `filesync.ts:141`); on `uploadWithTracker` retry-budget exhaustion, request a second signed URL with `fallback: true` and retry the same encrypted blob against the returned R2 URL (tagging the outcome for the rescue-rate metric); return `{ id, bucket }`. Ripple (mechanical, must be complete — the frontend bundle ships inside the add-on): `upload.ts:217` and the bucket echo at `upload.ts:248-257`, `apps/chat/components/{Send,MessageSend}.vue`, tests `src/test/lib/{upload,filesync,filesync-fs}.test.ts`.
- `helpers.ts` `uploadWithTracker` (`:301-363`): **no change** — it already sends `Content-Type: application/octet-stream`, matching what WS4's presign will sign (today's presign signs neither Content-Type nor Content-Length — see §7); the browser sets Content-Length from the Blob.
- **CSP:** add the exact host `https://<ACCT>.eu.r2.cloudflarestorage.com` to `connect-src` in **both** `frontend/csp.config.js` and the baked `frontend-csp-header` strings in `pulumi/config.stage.yaml:8` / `config.prod.yaml:9` — one PR, both files. Keep `https://*.backblazeb2.com` forever.
- **R2 bucket CORS:** `AllowedOrigins: ['*']` (CORS is not the auth boundary — the URL is the bearer secret, and ACAO:* forbids credentialed requests; extension `moz-extension://` origins can't be enumerated anyway), `AllowedMethods: ['PUT','GET']`, `AllowedHeaders: ['content-type']` — **enumerated, not wildcard** (⚠ "wildcard broken on R2" is community lore either way; enumeration matches the docs' own example and Prototype 1 validates it).
- **Origin-strip hack:** expected NOT needed — the existing `webRequest` hack (`packages/addon/src/background.ts:159-178`) matches only `https://*.backblazeb2.com/*` and R2 has real per-bucket CORS. Prototype 1 is the gate. Fallback if it fails: clone the hack for `https://*.r2.cloudflarestorage.com/*` + manifest host permission, shipped in the same add-on release as the capability flag — costs a diff, not a schedule slip.

### 2.5 IaC / CI / secrets

**Decided split:** Pulumi owns slow-changing Cloudflare resources (bucket, CORS, lifecycle, queues, DLQ, notification rule) + backend env/secrets/CSP; **wrangler in CI** owns the Worker script, queue-consumer registration (batch/retry tuning ships with the code that depends on it), and Worker secrets.

**Hard prerequisite with a gate:** `packages/send/pulumi/requirements.txt:2` pins `pulumi_cloudflare==5.48.0`, which **lacks** `R2BucketCors` / `R2BucketLifecycle` / `R2BucketEventNotification` / `QueueConsumer` (verified against SDK trees at both tags). Plan A: in-place upgrade to `>=6.17,<7` — `cloudflare.Record` survives as a deprecated alias of `DnsRecord`; migrate the two CNAMEs (`fargate.py:63-74`, `cloudfront.py:116-127`) with `pulumi.Alias`. **Gate: `pulumi preview --diff` on ci/stage must show no replaces on the DNS records** — a surprise replace of prod `send`/`send-backend` CNAMEs is an outage. Plan B (fallback): keep v5, provision the new Cloudflare surface via wrangler/REST in CI (`wrangler queues create … --message-retention-period-secs 1209600`, `wrangler r2 bucket notification create …`, `wrangler r2 bucket lifecycle …`), or a separate v6-pinned Pulumi project. *This is Open Decision D2.*

New module `packages/send/pulumi/cloudflare_r2.py` (v6 shapes verified: `R2Bucket{jurisdiction:'eu'}`, `R2BucketCors{rules[].allowed.{methods,origins,headers}, max_age_seconds}`, `R2BucketEventNotification{queue_id, jurisdiction, rules[].actions}` — requires Workers R2 Storage Read+Write on the provider token, **does not support `pulumi import`** — `R2BucketLifecycle`, `Queue{settings.message_retention_period}`). Every R2 resource must carry `jurisdiction='eu'`. The existing `cloudflare:apiToken` (`Pulumi.{stage,prod}.yaml:19-20`) is presumably DNS-scoped and must gain Workers R2 Storage Edit + Queues Edit.

**Secrets matrix:**

| Secret | Source of truth | Delivery | Consumer |
|---|---|---|---|
| Existing B2 key pair | Pulumi config secret | PulumiSecretsManager → AWS SM → Fargate `valueFrom` (verified pattern, `config.stage.yaml:119-121`) | backend |
| NEW backend R2 S3 keypair (Object Read & Write, staging bucket only; access_key = token id, secret = SHA-256(token value) — verified) | Pulumi config secret | same rails | backend presigner + HeadObject |
| NEW copier B2 key — **separate** `b2_create_key`: `writeFiles`+`readFiles`, **no `deleteFiles`, no `listFiles`**, `bucketIds` = send bucket (verified capabilities model) | GH Actions secret | `wrangler secret put` / `--secrets-file` (verified: secrets persist across deploys) | Worker |
| NEW `COPIER_HMAC_SECRET` (+`_PREVIOUS`) | Pulumi config secret (canonical) | (a) SM→Fargate; (b) same value → GH secret → `wrangler secret put` | backend + Worker |
| NEW `CLOUDFLARE_API_TOKEN` for CI (Workers Scripts Edit + Queues Edit) | GH Actions environment secret | `wrangler deploy` | CI |
| NEW Queues-Edit token + queue UUIDs | Pulumi config secret → SM → Fargate | sweep's HTTP publish | backend |

Verified caveat: pulumi-cloudflare v6 (at the recommended `>=6.17` pin) has **no** Worker-secret resource (v5's `WorkersSecret` was removed). Pulumi *could* set secrets via `WorkersScript`'s inline `secret_text` binding, but the Worker isn't Pulumi-managed here — wrangler is the decided path.

**Key-compromise blast radius (both secrets analyzed):**

- *Worker's B2 key* (why no-delete matters): confidentiality is E2E-safe regardless; without `deleteFiles` the key cannot destroy data; B2 retains prior file versions on overwrite (ensure bucket lifecycle keeps them); no `listFiles` → keys not enumerable.
- *`COPIER_HMAC_SECRET`* — the **wider** distribution surface (Worker secret, GitHub Actions, Pulumi state, AWS SM, Fargate env). A holder can call the internal routes for any known upload id. The flip handler's backend-owned HeadObject verification means they **cannot** flip an uncopied upload to `b2`; they **can** force a copied-but-unflipped upload into `failed` (recoverable — the recurring `failed` alerts and redrive runbook exist precisely so this cannot silently reach the lifecycle fuse) and can invoke the 410 path's `deleteEverywhere` only for ids whose rows are already deleted. Treat this secret with the same custody bar as the B2 key; rotation is the two-secret zero-downtime scheme (§2.3).

**CI:** Worker at `packages/send/copier` joins `pnpm-workspace.yaml`. `validate.yml`: add `worker-changed: ['packages/send/copier/**']` path filter (`validate.yml:31-42` pattern) + job running tsc, `@cloudflare/vitest-pool-workers` tests, and `wrangler deploy --dry-run`. `merge.yml`: `worker-deploy-stage` (`wrangler deploy --env stage`, environment `send-stage`), parallel to `backend-deploy-stage-aws`. `release.yml`: prod mirror behind the existing manual gate. The `iac-changed` filter already lints `packages/send/pulumi/**`.

**Local dev limits (both verified, the second community-lore-confirmed):** Miniflare emulates R2 as a *binding*, not an S3 HTTP endpoint — presigned URLs can't target local R2; and local R2 writes do **not** fire event notifications into local queues. So: unit tests inject synthetic event messages into the queue handler (`{account, action:'PutObject', bucket, object:{key,size,eTag}, eventTime}`) with B2/backend mocked via fetchMock; semi-local dev = `wrangler dev` + stage B2 key + `BACKEND_URL=http://localhost:8080` against docker-compose; true E2E = stage only. Day-to-day compose dev stays on `STORAGE_BACKEND=fs`; add one MinIO service with two buckets to `compose.yml` for registry/dual-delete integration tests (both providers speak S3 — one MinIO suffices).

**Cost sanity (verified anchors):** the figures below assume the worst case — **all** 50 TB/mo routed through R2. In the launch `fallback` mode only the failing fraction of uploads touches R2, so real costs sit far below these ceilings. Workers Paid $5/mo (10M req incl.; ~525k invocations at the all-traffic ceiling); Queues ~3 ops/message ≈ 1.6M ops/mo ≈ $0.24 after included 1M (free tier's 10k ops/day would NOT cover the all-traffic tier — Paid stands); R2 staging at the minutes-residency norm is near-zero (storage bills on peak-per-day GB-month), with the 7-day orphan fuse holding only abandoned uploads; R2 Class A/B negligible; R2→Worker→B2 egress free both ways. Total incremental ≈ $5/mo fixed + cents-to-dollars variable.

---

## 3. Sequenced delivery plan

### Phase 0 — blocking prototypes (run all three in week 1, in parallel; each ≤1 day build)

**P0 — Region reliability canary (the project's premise; required in-scope by #959).**
*Question:* does client→R2 actually fix the long-haul stall? #959 explicitly requires "a region canary validating client→R2 reliability from affected regions **before committing**." If R2's edge does not beat B2 from affected geographies, every other workstream in this note is moot.
*Steps:* from an affected geography (a Costa Rica-resident tester, or the closest VPN approximation, plus one unaffected control location), run N≥50 alternating ~100 MB PUTs to a presigned R2 URL and to the production B2 presigned-PUT path — same client hardware and network — recording stalls, timeouts, retries, and hard failures per attempt (reuse the thunderbird/platform-infrastructure bench harness from the #913 investigation if available).
*Assert:* the R2 failure+stall rate from the affected geography is materially lower than B2's, and not worse from the control.
*Success:* clear separation. *Kill:* no separation → the stall is not the long-haul hop; stop this track and reassess (#913's resumable-upload design becomes the primary fix). Note: the B2-first fallback rollout (§2.3) later supersedes this with continuous per-upload production evidence; P0 is the cheap pre-commitment check that the premise is even plausible.

**P1 — MV2 extension → R2 presigned PUT (client-side gate).**
*Question:* does the Thunderbird MV2 add-on's XHR PUT to `https://<acct>.eu.r2.cloudflarestorage.com` succeed with bucket CORS and **no** manifest host permission / Origin-strip hack?
*Steps:* (1) create an **EU-jurisdiction** R2 bucket + CORS `{origins:['*'], methods:['PUT','GET'], headers:['content-type']}`; (2) backend-style presign (aws-sdk v3, `forcePathStyle`, sign `content-type` and `content-length`); (3) from a dev build of the add-on (no manifest changes), run the real `uploadWithTracker` path with a ~100 MB blob; (4) attach a notification rule → scratch queue → trivial consumer; (5) after PUT, pull the queue.
*Assert:* (a) PUT 200 from the extension context, no CORS failure in console; (b) repeat from the web app origin; (c) object-create event arrives for the presigned PUT — record delivery lag; (d) PUT with Content-Length ≠ signed value → 403 `SignatureDoesNotMatch` (record result either way — undocumented behavior); (e) CORS preflight succeeds with enumerated `content-type` header.
*Success:* a+b+c pass. *Kill/fallback:* (a) fails → ship the Origin-strip twin + manifest permission in the same add-on release (schedule impact ~zero); (c) fails → replace event trigger with backend-side enqueue at `POST /api/uploads` time (sweep code path reused; the design survives); (d) fails → enforce size only via exact-size `createUpload` check.

**P2 — Worker streamed PUT to B2 (worker-side gate).**
*Question:* can a deployed Worker `fetch()` PUT a ~100/150 MB `FixedLengthStream` body to B2's S3 endpoint without buffering into the 128 MB isolate, and does B2 verify integrity as assumed?
*Steps:* throwaway Worker with the §2.1 pipeline verbatim behind a `GET /copy?key=` handler; R2 bucket bound as `STAGING` (seed via **presigned single PUT** — the production path, guaranteeing `checksums.md5`; use the EU bucket from P1); scratch B2 bucket in eu-central-003; run deployed (not local — local stream behavior unrepresentative).
*Assert:* (1) copy completes at 100 MB **and 150 MB** (the >128 MB case is the memory proof), B2 HEAD length == R2 size; (2) no memory/1102 errors in `wrangler tail`; (3) wall < 5 min, record CPU; (4) `checksums.md5` present on the seeded R2 object (EU bucket); (5) **negative:** deliberately wrong `Content-MD5` → B2 rejects the PUT (400 BadDigest-class) — this is the server-side verification the design leans on, currently field-evidence-grade; (6) **negative:** `FixedLengthStream(size+1)` → local stream error, no successful request; (7) record whether B2's PutObject ETag == hex MD5 (decides keeping the secondary ETag cross-check); (8) **throughput + billing (maintainer-requested):** run ~20 copies back-to-back, record sustained R2→B2 throughput (expect data-center-to-backbone speeds; if a 100 MB copy takes more than low single-digit minutes, the residency premise needs re-evaluation), then inspect the Cloudflare billing/analytics panel after the run — Class A/B op counts as predicted, **zero egress line items**, no surprise charges.
*Success:* 1–3 at both sizes, 5 and 8 pass. *Kill/fallback:* if 150 MB fails on memory (Workers buffers outbound bodies), switch to B2 S3 **multipart from the Worker** — five ~20 MB buffered parts, per-part Content-MD5 + final size check (the design survives; only the pipeline section changes). If throughput in (8) is poor, the architecture premise fails — stop and re-evaluate before building anything.

### Workstreams (PR-sized)

| WS | Content | Effort | Depends on | Touches |
|---|---|---|---|---|
| WS1 | Sentry URL scrubbing (frontend `beforeBreadcrumb`/`beforeSend` + backend console capture) | S | nothing — **ship immediately** | `frontend/src/lib/sentry.ts`, `backend/src/sentry.ts` |
| WS2 | Prisma migration (`StorageLocation`, `migratedAt`, index) + persist location in `createUpload` | S | — | `schema.prisma`, `models/uploads.ts:38-48` |
| WS3 | Provider registry refactor; delete tweedegolf + `setInterval`; rewrite storage tests; MinIO in compose | M | WS2 | `storage/*`, `wsUploadHandler.ts:81`, `compose.yml`, `test/storage/*` |
| WS4 | `uploads/signed` gate + `size` in body + Content-Length pinning + bucket echo + exact-size check | S–M | WS2, WS3, **P1(d)** | `routes/uploads.ts`, `models/uploads.ts`, `middleware.ts:372`, `.env.sample` |
| WS5 | Internal router (HMAC middleware, precheck, flip CAS + B2 re-verify, dead-letter) + `deleteEverywhere` + location-aware downloads + rate limit | M | WS2, WS3 | `routes/internal.ts` (new), `index.ts`, `download.ts`, `models.ts`, `models/sharing.ts` |
| WS6 | IaC: Pulumi v6 upgrade **gated by preview** (or Plan B), `cloudflare_r2.py`, queue/bucket/CORS/lifecycle/notification, CSP + Fargate env/secrets in config yamls | M | **D1 (EU jurisdiction), D2 (Pulumi path)** | `pulumi/*`, `frontend/csp.config.js` |
| WS7 | Copier Worker: copy pipeline, 3 consumers, HMAC client, wrangler envs, vitest-pool-workers | M | **P2**, WS5 contract, WS6 (for stage deploy) | `packages/send/copier/` (new) |
| WS8 | Reconciliation sweep + Sentry stuck-row alert + queue-UUID config | S | WS2, WS6 (queue IDs) | `backend/src/jobs/reconcileStaged.ts` (new) |
| WS9 | Client: B2-retry-exhaustion → `fallback: true` re-request in `sendBlob`, capabilities flag, `{id,bucket}` ripple + chat components + frontend tests | M | WS4, **P1(a)** | `frontend/src/lib/*`, `apps/chat/*`; `addon/src/background.ts` only if P1 fails |
| WS10 | CI: worker validate/deploy jobs, GH secrets, secrets runbook | S–M | WS7 scaffold | `.github/workflows/*` |
| WS11 | E2E: MinIO-backed upload→flip(curl w/ test HMAC)→re-download; legacy-client (no capabilities) asserts B2 presign; stage canary after each worker deploy | M | WS4, WS5, WS7 | `packages/send/e2e` |
| WS12 | Rollout: stage soak, prod `UPLOADS_R2_MODE=fallback` ramped per the success metrics below, runbook (DLQ triage, `failed`-row redrive, secret rotation, kill switch) | S | all, WS13/WS14 | env config |
| WS13 | Observability: sweep backlog gauge + graduated alerts, recurring `failed`-row alerts, DLQ-depth alerting surface (new — see D8), dashboards | S–M | WS8 | backend jobs + alerting config |
| WS14 | Add-on release vehicle: ship the capability-flag client in an ATN add-on release and coordinate the calendar — the frontend compiles *into* the add-on, so the prod ramp is gated on client adoption cadence, not just env vars | S code, calendar-bound | WS9 | `packages/addon` release process |

**Parallelization:** Week 1: P0 ∥ P1 ∥ P2 ∥ WS1 ∥ WS2. Then WS3→(WS4 ∥ WS5) ∥ WS6 ∥ WS7-scaffold ∥ WS10. Then WS7 ∥ WS8 ∥ WS9 ∥ WS11 ∥ WS13 → WS14 → WS12. Backend track ≈ 2–3 eng-weeks; Worker ≈ 1 week; IaC/CI ≈ 1.5–2 weeks (risk-driven, code small); client/E2E/observability/rollout ≈ 1.5–2 weeks. **Roughly 6–9 engineer-weeks total across 2–3 people** (the 5–6-week floor holds only if Phase 0 produces zero rework and no release-calendar stalls).

### Rollout success metrics (gates for the % ramp)

#959 defines success as a near-zero `UPLOAD_FAILED` rate — plumbing health alone (DLQ depth, stuck rows) does not prove that. The B2-first fallback mode makes the measurement direct: every fallback attempt is a same-file/same-client/same-network A/B pair. Before the ramp: capture a 2-week `UPLOAD_FAILED` baseline from Sentry and tag upload outcomes with the path taken (`b2-direct`, `r2-fallback-success`, `r2-fallback-failed`). **Primary metric: fallback rescue rate** — the fraction of uploads that exhausted B2 retries and then succeeded on R2 (target: near-100%); secondary: overall `UPLOAD_FAILED` trending to near-zero, replication p95 lag < 5 min (consistent with the minutes-residency policy), zero new `failed` rows, DLQ empty across the soak window (48 h at 1% and 5%; one week at 25%). Kill-switch triggers (`UPLOADS_R2_MODE=off`): rescue rate below the b2-retry baseline (R2 not actually helping), any data-loss invariant violation (§4), or replication backlog age > 12 h.

---

## 4. Failure modes and data-loss invariants

### Invariants (each must have a test)

- **I1 — no flip without durable copy:** `storageLocation='b2'` ⇒ a B2 object with key `id` exists whose length equals the expected encrypted size, verified twice (B2's server-side Content-MD5 check at PUT; the backend's own HeadObject length + R2-MD5-vs-B2-ETag comparison at flip — the ETag leg gated on P2 assertion 7). *Test: flip with missing/short B2 object → 409, row stays `r2`.*
- **I2 — no premature staging delete:** R2 object deleted only when the row reads `b2` at delete time (re-checked immediately before delete) and B2 HEAD confirms, ≥1 h after flip (the presigned-GET expiry floor). *Test: kill the flip between copy and delete → R2 object survives.*
- **I3 — lifecycle fuse > detection + response window:** staging lifecycle N (7 d) > sweep alert (24 h) + human runway; sweep re-enqueues until day 7. *Test: config assertion in IaC review; see D3 for the 7-vs-28-day dispute.*
- **I4 — idempotent consumer:** duplicate delivery of the same object-create message yields the same terminal state (verified: Queues is at-least-once with documented rare duplicates). *Test: deliver twice → one B2 object, one flip, both acks.*
- **I5 — no re-copy after flip:** consumer acks any event whose row is already `b2` — also the defense against overwrite-after-copy via a leaked presigned URL re-firing object-create. *Test: PUT to staging key after flip → no B2 write.*
- **I6 — event-before-row:** object-create precedes `POST /api/uploads`; consumer retries on 404 (delay cap 2 h keeps the 24 h branch reachable inside the retry budget), and the aged-404 path is **B2-aware**: report `aged-404` → backend HEADs B2 and removes any orphan from a died-mid-flip attempt → ack; abandoned PUTs drain via lifecycle, never via a *lasting* B2 write. *Test 1: event with no row → retried then orphan-acked, zero B2 objects. Test 2: kill the worker between B2 PUT and flip, then delete the row → no B2 orphan remains after the aged-404 path runs.*
- **I7 — user-delete wins:** deletes go to both stores (`deleteEverywhere`); flip on a deleted row → 410 + backend deletes the B2 orphan; the aged-404 path (I6) covers the copy-completed-but-never-flipped variant. *Test: delete row mid-copy → no orphan in either store after grace.*
- **I8 — double-flip race:** CAS (`updateMany where storageLocation:'r2'`) makes the loser a no-op 200. *Test: concurrent flips → exactly one transition, both 2xx.*
- **I9 — reconciliation closes the loop:** sweep re-enqueues rows stuck `r2` >1 h, alerts >24 h, emits the backlog gauge every cycle, and re-alerts recurringly on `failed` rows (excluded from re-enqueue, never from alerting); covers event loss, DLQ drops, and Postgres-restore desync (the consumer's `'gone'` path then auto-heals or terminal-fails). *Test: fabricate stuck rows → repaired; `failed` rows re-alert but are not re-enqueued.*
- **I10 — no transient poisoning:** only a backend-confirmed short/corrupt/missing B2 object may set `failed`; a transient verification error returns 503 and leaves the row `r2`. *Test: flip during a simulated B2 HEAD outage → 503, row stays `r2`, message retries, eventual flip succeeds.*

### Failure-mode table

| Failure | System behavior | Data at risk | Recovery |
|---|---|---|---|
| R2→Queue event never generated (guarantees undocumented) | Row stays `r2`; downloads presign from R2 — user-invisible | none | sweep re-enqueues ≥1 h; Sentry >24 h (I9) |
| Event-before-row race (normal, seconds) | Precheck 404 → backoff retry 30 s→2 h cap | none | automatic (I6) |
| Row never created (client died between PUT and `POST /uploads`) | 404 persists → aged-404 at >24 h: backend HEADs B2, removes any orphan, worker acks | none (orphan bytes) | R2 lifecycle @7 d (I6) |
| Worker dies between B2 PUT and flip, row later deleted | Redelivery hits 404 → aged-404 path finds the B2 object → backend `deleteEverywhere` | GDPR exposure if unhandled | I6 test 2 / I7 |
| Transient B2 HEAD failure at flip | 503 → row stays `r2`, message retries | none | automatic (I10) |
| B2 down 48 h | **Uploads keep succeeding** — every client falls back to R2; replication queue backs off 30 s→3 h over 25 retries ≈ 52 h coverage; stragglers → DLQ alert-and-ack | none (R2 holds bytes ≤7 d) | retries self-heal; sweep regenerates acked work; this failover is the design's headline win |
| Consumer down 48 h (bad deploy / CF incident) | Backlog grows (~35k msgs ≪ 25 GB cap); retention 14 d; backlog gauge warns within hours | none | autoscaled drain on recovery; graduated alerts (I9) |
| Duplicate delivery / client re-PUT pre-flip | Precheck `b2`→ack; mid-copy duplicate overwrites same key with identical bytes; CAS idempotent | none | by design (I4/I5/I8) |
| Mid-stream B2 failure / truncation | `FixedLengthStream` errors locally, or B2 rejects Content-MD5 → whole-object retry (streams not seekable; `aws4fetch retries: 0` so the queue owns the retry) | none | retry w/ backoff |
| Flip integrity mismatch (backend-confirmed short/corrupt B2 copy) | 409 → CAS `r2→failed` + **recurring** Sentry alerts; downloads keep serving from R2 | none while alerts are actioned | human-gated redrive before the lifecycle fuse; recurring alerts make silent expiry impossible |
| HMAC secret drift/rotation skew | 401s → long-delay retries; copies keep succeeding; flips stall; downloads unaffected (rows still `r2`) | none | dual-secret acceptance; backlog gauge = early pager |
| User deletes mid-copy | Flip 410 → backend `deleteEverywhere` removes B2 orphan | GDPR exposure if unhandled | I7 |
| Flip ok but grace-delete message lost | R2 object lingers ≤7 d | none (B2 verified) | lifecycle backstop |
| Grace delete fires against a bad state | Delete consumer re-verifies row==`b2` + B2 HEAD before the only destructive op | none | I2 |
| Uncopied (or `failed`) object reaches lifecycle day 7 | **The true data-loss path** — requires ~6 days of ignored alerts (stuck-`r2` gauge, >24 h page, and recurring `failed` alerts all firing) | loss | I3 + I9/I10 + alerting SLA (D3) |
| Postgres restored to older snapshot (row says `r2`, staging object gone) | Sweep re-enqueues → consumer `'gone'` path: HEADs B2 → auto-flips if the durable copy exists, else CAS→`failed` + alert | dangling pointers until healed | auto-heal via `'gone'` path; I3 margin; document RPO in runbook |

---

## 5. Risk register (top 10)

| # | Risk | L×I | Mitigation | Owner |
|---|---|---|---|---|
| 1 | Workers outbound `fetch()` buffers the streamed body → 100 MB copy impossible in 128 MB isolate | L-M × H | **P2** (150 MB case is decisive); contingency: B2 multipart in ~20 MB buffered parts — pipeline-only change | worker |
| 2 | MV2 extension PUT to R2 blocked (CORS/Origin behavior) | M × H | **P1**; fallback Origin-strip twin + manifest permission in same add-on release | client |
| 3 | Presigned bearer URLs reaching telemetry (breadcrumbs, tracing spans, session replay) | H × M-H | WS1 scrubbing ships first (incl. `beforeSendTransaction` — spans are the easily-missed leg); Sentry server-side scrub as stopgap; replay-policy audit (D9) | client + backend |
| 4 | Pulumi v5→v6 upgrade produces destructive diff on prod DNS CNAMEs | M × H | `pulumi preview --diff` gate on ci/stage; `pulumi.Alias`; Plan B (wrangler provisioning / separate project) | infra |
| 5 | Copy-pipeline data loss (flip-before-verify, premature delete, transient-poisoned `failed` rows, lifecycle vs outage) | M × H | invariants I1–I3, I9, I10 with tests; delete gated on double verification; transient/terminal split at the flip; recurring `failed` alerts | worker + backend |
| 6 | CSP dual-source drift (csp.config.js vs pulumi yaml) silently blocks gated users' PUTs | M × H | single PR touching both; stage e2e; 1–5% initial rollout + kill switch | client + infra |
| 7 | B2 write-path surprises when replacing tweedegolf native API with aws-sdk S3 (`WHEN_REQUIRED` lore; stale 2024 comment) | M × M | cred-gated live B2 test suite must pass before tweedegolf removal; keep `WHEN_REQUIRED` (no-op if fixed) | backend |
| 8 | HMAC secret drift between Worker (GH secret) and backend (Pulumi/SM) → silent flip stall | M × M | dual-secret acceptance; stage canary exercising callback after each worker deploy; DLQ-depth alert | infra |
| 9 | R2 event generation loss / undocumented delivery guarantees | L × M | sweep is the correctness mechanism (not an optimization); 24 h alert; P1 measures real lag | backend |
| 10 | Worker B2 key compromise corrupts served objects | L × H | key has no `deleteFiles`/`listFiles`, bucket-scoped; B2 file versioning retained as undo; E2E encryption preserves confidentiality regardless | infra |

Honorable mentions: Content-Length pinning enforcement gated on P1(d) (with the exact-size `createUpload` check as fallback); event-before-row DLQ noise (eliminated by the 2 h retry cap + aged-404 ack path); Queues delaySeconds cap ambiguity (resolved — verified 24 h; 1 h grace is safe); `COPIER_HMAC_SECRET` custody (§2.5 blast radius).

---

## 6. Open decisions for humans

| ID | Decision | Options / recommendation | Blocks |
|---|---|---|---|
| **D1** | **EU jurisdiction for the staging bucket** (immutable at creation; changes endpoint to `<acct>.eu.r2.cloudflarestorage.com`, CSP string, all IaC `jurisdiction` params; legal posture for a GDPR-sensitive product) | Recommend `eu` from day one (B2 is eu-central-003). Note: Queues/Workers are global — object bytes transit the Worker; state this in the privacy review | **WS6, and ideally P1/P2** (prototype against the real endpoint) |
| **D2** | **Pulumi v6 in-place upgrade vs wrangler-provisioned Cloudflare surface** (two angles disagreed) | Recommend attempting v6 gated on a clean `preview --diff`; fall back to wrangler-in-CI. Either way the Worker deploys via wrangler | **WS6** |
| **D3** | **Lifecycle fuse N + grace period** | Decided defaults: N=7 d fuse (orphans only — normal residency is minutes, per #959 maintainer direction), grace 1 h (= presigned-GET expiry floor). A longer fuse (28 d) was argued for restore-window margin; N=7 keeps orphan cost/residency low but REQUIRES the committed 24 h-alert response SLA | WS6 config only |
| **D4** | Cloudflare DPA / subprocessor list / privacy-policy update (Cloudflare transiently holds E2E-encrypted content ≤N days; metadata = uuid keys, sizes, timestamps) | Legal/MZLA; engineering not blocked but **prod rollout (WS12) is** | WS12 |
| **D5** | One Cloudflare account for stage+prod? Workers Paid enabled? (bucket names are account-global; Queues free tier can't cover the 50 TB tier) | Confirm before WS6 naming | WS6 |
| **D6** | Rollout: `gatePct` default when the percent env is unset (design: 100, behind the `UPLOADS_R2_MODE` switch), ramp schedule, and the criteria for ever widening `fallback` → `all` (region cohorts?) | Ops preference | WS12 |
| **D7** | Flip-409 policy: `failed` enum + recurring alerts + redrive runbook (decided) — does ops also want quarantine/suspicious-file marking or an attempts/lastError column? | Default: enum + recurring alerts only | none |
| **D8** | DLQ alerting surface: Cloudflare-side queue-depth alerting is a new monitoring surface (no CloudWatch equivalent in `tb_pulumi.cloudwatch`); the sweep's backlog gauge (WS13) covers B2-degradation early warning, so this decision narrows to where DLQ-depth alerts live + who owns triage | Ops runbook decision | WS12/WS13 |
| **D9** | Sentry session replay on upload/download screens at all (signed URLs in network activity)? | Recommend disabling replay network capture for storage hosts | WS1 scope |
| **D10** | Adjacent hardening items discovered during this design are tracked in the **private issue tracker**; the registry refactor touches `download.ts` anyway — schedule them opportunistically with WS3/WS5? | Recommend yes where the file is already open | none |
| **D11** | R2 S3-credential automation: attempt `cloudflare.ApiToken`-based generation (EU permission-group naming under-documented) vs documented one-time dashboard token per env (like the existing manual B2 key step, `pulumi/README.md:54-55`) | Recommend manual + runbook now, automate later | WS6 (minor) |

---

## 7. Appendix — evidence ledger

Every load-bearing platform claim in this note was checked against official documentation (2026-07-06). The first table records claims where the commonly-repeated version is weaker or wrong — the design uses the verified reality; the second table lists claims that cannot be settled on paper and are therefore prototype-gated.

### Verified realities behind commonly-misstated claims

| Commonly-repeated / weaker claim | Verified reality this design uses |
|---|---|
| Backblaze's `cloudflare-b2` sample proves B2 accepts `UNSIGNED-PAYLOAD` | The sample is GET/HEAD-only — weak evidence for PUT. The strong evidence is production itself: `@aws-sdk/s3-request-presigner` presigned PUTs use `X-Amz-Content-Sha256=UNSIGNED-PAYLOAD` (query form), and Send's presigned uploads to B2 have run in prod since 2024. P2 still asserts the *header* form the Worker uses |
| B2 S3 docs show Content-MD5 support/enforcement | The s3-put-object page never mentions Content-MD5; enforcement is field-evidence-grade (Object Lock runtime error, sftpgo #1336) → **P2 assertion 5 (wrong-MD5 → 400) is mandatory, not optional** |
| `WHEN_REQUIRED` fix documented in pingvin-share #798 | #798 documents only the breakage. Cite AWS's official reference: `docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html` (+ v3.729.0 release notes) |
| v6 has `WorkersForPlatformsScriptSecret` for Worker secrets | **Refuted:** v6.17.0 ships *no* secret resource of any kind (v5's `WorkersSecret` was removed). Alternatives: `WorkersScript.secret_text` inline binding (value in Pulumi state; drift behavior untested) or wrangler — design uses wrangler |
| Queues requires Workers Paid | Stale: free tier exists (10k ops/day hard cap) — insufficient at the 50 TB tier (~52k ops/day at ~3 ops/message), so Paid remains the planning assumption; dev/stage could run free |
| workers-sdk #5514 (EU event notifications) needs wrangler v4+ | Fixed **platform-side** Nov 2024 (aligned with the 2024-10-21 R2 release note); no wrangler version requirement — and the rule is IaC-configured anyway |
| Only Logpush excluded on jurisdiction buckets | Super Slurper is also excluded (neither is used) |
| Queues delaySeconds cap 12 h (older docs) | Verified **24 h** — the 1 h grace delete is comfortably legal |
| Consumer concurrency "GA'd Sep 2024" | Conflated: Sep 2024 was Queues' own GA (raised concurrency to 250, throughput to 5,000 msg/s). Net capability as claimed |
| "The current presign signs Content-Type" | It signs **neither** Content-Type nor Content-Length: `s3b2.ts` passes no `signableHeaders`, and the SDK excludes `content-type` from signing by default (aws-sdk-js-v3 #3497). WS4 adds both via `signableHeaders` |
| `AwsClient` is a thin signer | It defaults to **10 internal retries**, which re-send an already-consumed `ReadableStream` — must be constructed with `retries: 0` in the Worker (§2.1) |
| At-least-once cited from batching-retries page | Lives at `queues/reference/delivery-guarantees/` (facts correct) |

### Unverifiable-on-paper claims → prototype gates

| Claim | Grade | Gate |
|---|---|---|
| Workers outbound `fetch()` streams (doesn't buffer) a fixed-length request body | undocumented platform behavior | **P2** assertions 1–2 @150 MB (the decisive test) |
| B2's S3 layer rejects chunked transfer encoding (inherited from native API) | inference from native docs | P2 (FixedLengthStream costs nothing regardless) |
| B2 single-part S3 ETag == hex MD5 | doc example only (32-hex shown); community reports quoting quirks | P2 assertion 7 — record; drop the secondary ETag check if unreliable |
| Presigned S3 PUT fires an R2 `PutObject` event | docs list actions, never mention presigned URLs | **P1** assertion (c); fallback: backend-side enqueue |
| R2 event *generation* delivery guarantees / latency | entirely undocumented | sweep is load-bearing by design; P1 measures lag |
| R2 enforces a signed `Content-Length` on presigned PUT (quota fix) | documented nowhere official (Content-Type analog is documented) | **P1** assertion (d); fallback: exact-size `createUpload` check |
| MV2 extension PUT to R2 S3 host without manifest permission works under CORS `['*']` | untested | **P1** assertions (a)(e) |
| Wildcard `AllowedHeaders` broken on R2 | community lore either way | design enumerates `['content-type']` (matches docs' example); P1 validates |
| B2 accepts `x-amz-checksum-*` since ~July 2025 (could drop `WHEN_REQUIRED`) | Backblaze evangelist forum comment, no release note | keep `WHEN_REQUIRED` (documented no-op-if-fixed); optionally test live |
| Local R2 writes don't fire event notifications into local queues | community-confirmed gap, docs silent | accepted; test strategy designed around it (synthetic events + stage E2E) |
| `cloudflare.ApiToken` can mint bucket-scoped R2 S3 creds for an EU bucket | permission-group naming under-documented | 30-min spike or D11 manual fallback |
| `checksums.md5` present on EU-jurisdiction bucket objects via presigned PUT | documented for non-multipart generally; EU path less traveled | P2 assertion 4 (seed via presigned PUT on EU bucket) |

### Implementation footnotes surfaced by verification (easy to lose, all incorporated above)

Queues HTTP publish addresses queues by **UUID**, not name (sweep config). DLQ 4-day persistence applies only without an active consumer (ours has one). R2 delete events omit `size`/`eTag`; create events may include `copySource` (defensive parsing). Multipart-uploaded R2 objects have **no** `checksums.md5` (two-pass fallback is first-class). Queue-consumer CPU default is 30 s — `cpu_ms` raised explicitly (queue consumers share the standard Worker CPU ceiling; the 15-minute figure is **wall-clock**, not CPU). `R2BucketEventNotification` does not support `pulumi import`. Free-plan Queues retention is fixed at 24 h (irrelevant on Paid).
# Feasibility & Cost Evaluation: R2 Staging → B2 Replication for Send

Status: **Draft for review** — feasibility deliverable for
[thunderbird/tbpro-add-on#959](https://github.com/thunderbird/tbpro-add-on/issues/959).
**The goal is upload reliability**: make Send uploads succeed when a direct
upload to Backblaze B2 stalls and fails (`UPLOAD_FAILED`, #959). This note
asks whether the R2-fallback approach to that problem is feasible and what it
costs — it evaluates the four feasibility caveats (job infrastructure,
replication byte-path cost, client rollout, storage-layer refactor), prices the
coherent architecture bundles, and recommends one. The selected design
(Bundle B) is fully specified in the companion note
[R2StagingReplicationDesign.md](./R2StagingReplicationDesign.md).

**Date:** 2026-07-06 · **Scope:** four fact-checked caveat evaluations, all pricing verified against official vendor sources on 2026-07-06 unless noted. Volume scenarios: 1 / 10 / 50 TB uploaded per month (~10,500 / 105,000 / 525,000 objects at ~100 MB parts).

## 0. Why staging in R2 is nearly free: the billing mechanics

Three verified billing properties make the staging tier cost negligible relative to the data volume moved through it:

1. **R2 storage is metered as GB-month, "calculated by averaging the _peak_ storage per day over a billing period (30 days)"** ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Transient objects are not free — they count toward the day's peak — but an object resident <24 h contributes roughly `size × (1 day / 30)` of the $0.015/GB-month rate (≈ $0.0005/GB). At 10 TB/mo of uploads with ~1-day residency, steady-state staged data is ~333 GB, costing ~$5/mo.
2. **Egress from R2 is free, by any path** (Workers API, S3 API, public domains) — the R2→B2 replication reads cost nothing in bandwidth.
3. **Workers bill CPU-time, not wall-clock or bandwidth** — streaming a 100 MB body through a Worker consumes milliseconds of billed CPU while the I/O time is free.

The result: the replication tier's cost is dominated by a $5/mo Workers Paid subscription plus cents of operations, instead of the ~$0.09/GB AWS egress that any AWS-resident copier would pay.

---

## 1. Per-caveat summaries

### Caveat 1 — Background-job infrastructure (repo has none today)

| Option | Job-infra cost 1/10/50 TB | Effort | Notes |
|---|---|---|---|
| (a) In-process poller in existing Fargate tasks (SKIP LOCKED) | ~$0 / ~$0 / $0–40 | S | Cross-ref: forces AWS egress ~$92/$922/$4,403 (caveat 2) |
| (b) EventBridge Scheduler → ECS RunTask | ~$3 / ~$4.50 / ~$11–15 | M | Same egress penalty; new hand-rolled Pulumi pattern |
| (c) Cloudflare Worker + Queues + R2 event notifications | ~$5 / ~$6.50 / ~$15 all-in | L | Zero egress; push-based; best retry semantics (at-least-once, DLQ) |
| (d) Always-on dedicated Fargate worker | ~$21 / ~$21 / ~$21–41 | M | Same egress penalty; worst fixed cost |

All pricing claims **confirmed** (Fargate $0.04656/vCPU-hr + $0.00511/GB-hr eu-central-1; Workers Paid $5/mo incl. 10M req + 30M CPU-ms; Queues 1M ops incl. then $0.40/M — official pricing pages, 2026-07-06). Note on Worker limits: queue consumers share the **standard** Worker CPU ceiling — the larger 15-minute figure is *wall-clock* per invocation, not CPU; streaming a copy consumes seconds of wall-clock and well under a second of CPU, so (c) is comfortably inside both.

**Recommended:** (c) as the endgame at any volume above ~1 TB/mo; (a) as an acceptable quick start; avoid (d).

### Caveat 2 — Replication byte-path egress cost (the decision-dominating line)

Neither vendor can server-side copy to the other (Super Slurper/Sippy are R2-destination-only — confirmed). Every byte transits compute somewhere.

| Option | Total 1/10/50 TB | Effort | Notes |
|---|---|---|---|
| (a) Through existing Fargate | ~$92 / ~$922 / ~$4,403 (egress only, binary-TB convention used throughout this doc; AWS's 100 GB/mo free DTO tier could trim ~$9 at the 1 TB scenario if unconsumed elsewhere) | M | $0.09/GB DTO (tiered $0.085 above 10 TB), confirmed via AWS Bulk Price List API. No NAT gateway exists today (verified in Pulumi config) — a future move to private subnets + NAT would add ~$104/TB |
| (b) Cloudflare Worker replicator | ~$6 / ~$11 / ~$33 | M | R2 egress free, Worker streaming time unbilled (only CPU-ms), B2 ingress free — all confirmed. ~130× cheaper than (a) at 50 TB |
| (c) Hetzner VPS relay | ~$7 / ~$12 / ~$67 | M | Works, but a pet server + third key-custody domain. **Correction applied:** Hetzner's June 2026 price rise was ~31–38% on entry plans (up to +144–169% mid-tier), not "~20–30%"; the €5.49 entry price and 20 TB included traffic are exact, so the economics stand |

**Recommended:** (b). The ~$5/mo flat Worker vs ~$900–4,400/mo AWS egress asymmetry is fully verified and decides the architecture.

### Caveat 3 — Client rollout (add-on manifest, CORS, old versions)

| Option | Marginal cost | Effort | Verdict |
|---|---|---|---|
| (a) Capability flag in `POST uploads/signed` + env kill switch | $0 | S | **Recommended control plane.** Old clients never send the flag → get B2 forever by construction; rollback is an env flip |
| (b) Version-header % rollout | $0 | M | Degenerates into (a) (no version header exists today); keep only the server-side % gate layered on (a), hashed per-file/per-user to avoid mixed-location parts of one file |
| (c1) CORS-only direct R2, **no manifest change** | $0 | S | **Recommended transport, pending staging verification.** R2 per-bucket CORS works with presigned URLs (confirmed); B2's server-side preflight denial that forced the Origin-strip hack doesn't exist on R2. Set `forcePathStyle: true` so the host is one stable string; enumerate `AllowedHeaders: ['content-type']` (wildcard is **community-verified** not to work on R2 — not in official docs, so staging must prove it) |
| (c2) Proxy uploads through backend | ~$135 / ~$1,006 / **~$4,570** (corrected) | M | Rejected — pure egress waste, relocates B2's flakiness class onto your own infra. **Correction:** 50 TB egress is ~$4,394–4,403 with proper tiering, not ~$4,600 (~5% overstatement; conclusion unchanged) |
| (c3) Worker on custom domain fronting R2 | $5/mo | L | Rejected — doesn't avoid the manifest problem, and encrypted ~100 MB parts collide with the 100 MB Worker body limit (Free/Pro zones, confirmed) |

Fallback if c1's staging test fails: add `https://*.r2.cloudflarestorage.com/*` to the manifest and accept the staged-update prompt on the standalone channel — confirmed that the old version *keeps running* if the user doesn't approve (degraded adoption, zero breakage). The built-in/system add-on channel rides Thunderbird releases (ESR lags ~1 year), so **the B2 presign fallback is permanent, not transitional**.

### Caveat 4 — Storage-layer refactor for per-Upload routing (r2|b2|failed)

All options are $0 recurring; differentiators are blast radius and test surface.

| Option | Effort | Verdict |
|---|---|---|
| (a) Thread optional `location` param through FileStore | M | Optional-parameter footgun: forgotten arg silently touches B2 at the two delete sites — data-loss class |
| (b) Provider registry: `StorageProvider` interface, one @aws-sdk/client-s3 impl for both vendors, required `location` everywhere | M | **Recommended.** Deletes real debt (12h token-renewal setInterval, directClient init race); replication worker consumes the same interface. Hard requirements: `set()` via lib-storage Upload (WS path passes client-stated size), keep the tweedegolf B2 adapter behind an env flag for one release as rollback |
| (c) R2 staging sidecar module, FileStore untouched | S | Fallback for smallest increment; codifies asymmetry that rots if R2's role ever grows |

All five load-bearing claims confirmed. **Refinements from verification:** the aws-sdk v3.729+ CRC32 checksum incompatibility needs `WHEN_REQUIRED` **only on the B2 client** — Cloudflare fixed R2 server-side on 2025-02-03 (setting it on both remains the sensible uniform choice). Prisma migration — final enum shape is `{ r2 b2 failed }`, no `migrating` state (superseded here; see the design note §2.3): the column/enum/default are metadata-only on PG11+ and safe on the live table, but the accompanying **index must be created out-of-band with `CREATE INDEX CONCURRENTLY`** (Prisma's inline `CREATE INDEX` write-locks the live `Upload` table).

---

## 2. Architecture bundles

R2 staging costs (Class A PUTs + ~1-day residency + Class B reads ≈ $0.55 / $5.55 / $28 per month) are part of the base #959 design and appear in every bundle. A longer R2 grace period scales that line linearly.

### Bundle A — "AWS-minimal quick ship"
In-process SKIP LOCKED poller (job-infra a) · replication through Fargate (egress a) · capability flag + CORS-only client (rollout a+c1) · R2 sidecar or provider registry (refactor c or b).

| | 1 TB | 10 TB | 50 TB |
|---|---|---|---|
| Fixed | $0 | $0 | $0 |
| AWS egress | ~$92 | ~$922 | ~$4,403 |
| R2 staging | ~$0.55 | ~$5.55 | ~$28 |
| Autoscale overflow | — | — | $0–40 |
| **Total/mo** | **~$93** | **~$928** | **~$4,470** |

**Effort:** S+S+S/M — the smallest total diff; zero new deploy surfaces, zero Pulumi changes. **Rollout:** ships fastest; replication shares CPU with the API (tail-latency risk, autoscaler cpu_threshold 80); economically untenable past a few TB/mo.

### Bundle B — "Cloudflare Worker replication" (endgame)
R2 event notifications → Queues → consumer Worker streams R2→B2, calls an HMAC-authenticated backend endpoint to flip `storageLocation` (job-infra c / egress b) · capability flag + CORS-only client (a+c1) · provider registry (refactor b). **Compliance note:** this bundle (like every R2-staging variant, but stated here because it is the recommendation) onboards Cloudflare as a new subprocessor transiently holding E2E-encrypted user content **and processing end-user IP addresses** (TLS termination on every direct PUT and pre-flip GET) — requiring a DPA with transfer mechanism (SCCs/DPF — Cloudflare is US-HQ), subprocessor-list and privacy-policy updates, Art. 30 records, and a DPIA refresh. R2's EU jurisdiction guarantees **storage at rest only**; request processing and Queues have no residency guarantee.

| | 1 TB | 10 TB | 50 TB |
|---|---|---|---|
| Workers Paid (fixed) | $5 | $5 | $5 |
| CPU-ms / Queues overage | ~$0 | ~$0–1.50 | ~$1–10 |
| R2 staging | ~$0.55 | ~$5.55 | ~$28 |
| AWS egress | $0 | $0 | $0 |
| **Total/mo** | **~$6** | **~$11–13** | **~$34–43** |

**Effort:** L (Worker + Queues + event notifications + CI deploy + backend callback endpoint + secrets in a second cloud) + S client + M refactor. **Rollout:** new platform for this team, but the Pulumi stack already carries Cloudflare provider credentials (DNS). Best retry semantics of any option (at-least-once, DLQ, no polling). Must-prototype-first: fixed-length streaming PUT to B2 within the 128 MB Worker memory limit, and the event-before-row race (callback returns retryable-404, Queues redelivers).

### Bundle C — "Hetzner relay" (no-second-runtime alternative)
Tiny EU VPS pumps R2→B2, driven by a backend job API (egress c) · same client and refactor choices as B.

| | 1 TB | 10 TB | 50 TB |
|---|---|---|---|
| Server (fixed) | ~$6.50 | ~$6.50 | ~$6.50 (+$6.50 if doubled) |
| Traffic overage | $0 | $0 | ~$33 |
| R2 staging | ~$0.55 | ~$5.55 | ~$28 |
| **Total/mo** | **~$7** | **~$12** | **~$67** |

**Effort:** M, plus permanent ops ownership of an out-of-band pet server. **Rollout:** matches B's economics but adds a third key-custody domain and a GDPR processor review — likely fails security review before it fails on cost. Included only as the fallback if a second *managed* runtime is vetoed.

---

## 3. Recommendation

**Adopt Bundle B (Cloudflare Worker replication), phased through Bundle A's job code if speed-to-ship matters.**

Justification:
- **The egress line decides it.** Every AWS-resident replicator pays $0.09/GB out of eu-central-1 — ~$922/mo at 10 TB, ~$4,403/mo at 50 TB, likely exceeding the entire current hosting bill — while the Worker path moves the same bytes for a flat ~$5–15/mo. Both sides of this asymmetry were confirmed against official vendor pricing on 2026-07-06.
- **The incremental surface is smaller than it looks.** The Cloudflare account and Pulumi provider already exist in this stack; the client change is one JSON field; the refactor (provider registry) is needed by any bundle and deletes existing tech debt.
- **Phasing is cheap if designed for.** If the team wants #959 live before the Worker is proven: ship the in-process SKIP LOCKED poller (Bundle A) *but* implement the `storageLocation` pointer-flip as a standalone authenticated internal endpoint from day one. The copier then relocates to the Worker with zero schema or API changes when volume — and the egress bill — grows. Break-even vs the Worker's $5/mo floor is roughly 60 GB/mo of uploads; above ~1 TB/mo Bundle A is strictly worse.
- Bundle C is dominated: similar cost to B, worse security/ops story.

**Open questions a human must decide:**
1. **Staging verification (blocking, both cheap):** (i) can a TB 140 MV2 extension PUT to `<ACCOUNT_ID>.r2.cloudflarestorage.com` with *no* manifest permission under R2 CORS `AllowedOrigins ['*']` (moz-extension:// / null Origin accepted)? (ii) does a Worker's fixed-length streamed fetch PUT succeed against B2's S3 endpoint? If (ii) fails, the Worker design needs rework (buffering is impossible at 128 MB).
2. **Is a second production runtime (Wrangler deploys, B2 keys in Cloudflare secrets, split observability) organizationally acceptable?** This is the only real argument against Bundle B.
3. **Expected upload volume** — below ~1 TB/mo indefinitely, Bundle A alone is defensible.
4. **R2 grace period before delete** — staging cost scales linearly with residency (2 days ≈ 2× the $0.55/$5.55/$28 line).
5. **EU jurisdiction bucket?** An EU-jurisdiction R2 bucket changes the hostname to `<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` (affects CSP strings and the manifest fallback); decide before pinning hostnames. Jurisdiction covers storage **at rest only** — see the Bundle B compliance note for the processing-side obligations (DPA, SCCs/DPF, subprocessor list, Art. 30, DPIA).
6. **Alerting** — replication backlog depth/age must page somewhere (CloudWatch group exists; Workers need their own hook). Old-client share is unmeasurable today (no version header) — accept the B2 presign path as permanent.
7. **NAT guard-rail** — add a loud Pulumi comment: introducing a NAT gateway adds ~$104/TB to any AWS-resident replicator.

---

## 4. Appendix — corrected / refuted claims from fact-checking

Of 31 verified claims, 30 were confirmed exactly; 1 needed correction. Nuances that adjust numbers are listed too.

| # | Claim (caveat) | Verdict | Correction / nuance |
|---|---|---|---|
| 1 | Hetzner June 2026 price rise "~20–30%" (egress-cost) | **needs-correction** | Entry plans rose ~31–38% (CX23 €3.99→€5.49 = +38%); mid-tier up to +144–169%. The load-bearing €5.49/mo entry price, 20 TB included traffic, and €1/TB overage are exact — relay economics (~$7–67/mo) intact |
| 2 | Backend-proxy egress at 50 TB "~$4,600/mo" (client-rollout c2) | confirmed with correction | Correct tiered figure is ~$4,394–4,403 (10 TiB @ $0.09 + 40 TiB @ $0.085) — ~5% overstatement; "pure waste" conclusion unchanged |
| 3 | R2 wildcard `AllowedHeaders '*'` doesn't work (client-rollout c1) | confirmed, weak sourcing | Community-verified (multiple independent write-ups + Cloudflare Community), **absent from official Cloudflare docs** — covered by the mandatory staging test; enumerate `['content-type']` regardless |
| 4 | `WHEN_REQUIRED` checksum fix cited to pingvin-share issue (storage-refactor) | confirmed, attribution fixed | That issue documents only the error; the fix belongs to the nocobase issue + AWS official docs. **Materially: R2 no longer needs the workaround at all** (Cloudflare fixed server-side 2025-02-03) — only the B2 client requires it |
| 5 | AWS egress ~$92 at 1 TB (job-infra, egress-cost) | confirmed, minor nuance | AWS's 100 GB/mo global free DTO tier could trim ~$9 at the 1 TB scenario if unconsumed — immaterial |
| 6 | Queue-consumer Workers get CPU limits above the 5-min standard cap | **needs-correction** | Consumers share the standard Worker **CPU** ceiling; the 15-minute figure is *wall-clock* per invocation. Immaterial to the copier (streaming uses seconds of wall-clock, <1 s CPU) but recorded here as a correction, not a confirmation |
| 7 | "B2 can't list moz-extension:// origins, hence the Origin-strip hack" (client-rollout) | confirmed, causal nuance | A bare `'*'` in B2 allowedOrigins matches *any* origin, so the hack wasn't the only theoretically possible approach; the stated fact (specific extension origin unlistable) is accurate and doesn't affect the R2 plan |

No verification result changed any recommendation. The largest uncertainty ranges remaining are behavioral (staging tests in open question 1), not financial: every dollar figure above is anchored to official vendor pricing fetched 2026-07-06, except Worker CPU-ms per 100 MB object — budgeted conservatively at ~500 ms (matching the design note's `cpu_ms` sizing); even that conservative figure adds only ~$2–3/mo at 50 TB.
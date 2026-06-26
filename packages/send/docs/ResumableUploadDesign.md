# Design Note: Chunked / Resumable Upload for Send

Status: **Draft for review** — design-first deliverable for
[thunderbird/tbpro-add-on#913](https://github.com/thunderbird/tbpro-add-on/issues/913).
No production code changes accompany this note; it exists to choose an
approach before implementation.

## 1. Problem & root cause

Production uploads to Backblaze B2 fail with `UPLOAD_FAILED` — Sentry
**SEND-SUITE-FRONTEND-24H** (`eu-central-003`, a long-haul Costa Rica → EU
path). The failure mode is a connection **stall** mid-PUT.

The structural cause: Send uploads each object as **one HTTP PUT with no
resume**. A stall partway through a 100 MB PUT discards the entire 100 MB and
restarts from byte zero. The timeout (#910) and retry-window (#912) changes
reduce how often we give up, but a retry still re-sends the whole object from
scratch — they paper over the mechanism rather than fixing it. Resumable
upload attacks it directly: a transient stall should resume from the last
durably-uploaded chunk, not from zero.

Bench context (thunderbird/platform-infrastructure#274): **concurrency is not
implicated** — Phase B (5×100 MB concurrent) passed 150/150 with zero retries.
Failures appeared on **serial large uploads**. Per the issue, **do not reduce
`BATCH_SIZE` (5)** — it is not the problem.

## 2. Current architecture (as built)

End-to-end path for a large file, with citations:

1. **Client split.** `doUpload` splits when `fileBlob.size > SPLIT_SIZE`
   (`src/lib/upload.ts:143`). `SPLIT_SIZE` defaults to **100 MB**
   (`src/lib/const.ts:31`, `VITE_SPLIT_SIZE_IN_MB || 100`).
   `splitIntoMultipleZips` (`src/lib/utils.ts:319`) slices the blob and zips
   each slice into an **independent** `NamedBlob`.
2. **Batch.** Parts upload concurrently in batches of `BATCH_SIZE = 5` via
   `Promise.all` (`src/lib/upload.ts:299-318`). Each part becomes its own
   `Upload` row (`part` column) and `Item` (`multipart: true`,
   `totalSize: <original>`).
3. **Per-part encryption.** `sendBlob` (`src/lib/filesync.ts:132`) requests a
   presigned URL, then `encrypt(stream, aesKey)` produces a **fresh, complete
   ECE stream** for that part (own salt/header, `seq` reset to 0).
4. **Single PUT.** `uploadWithTracker` (`src/lib/helpers.ts`) does one
   `XHR PUT` of the whole encrypted blob to the presigned URL, with the
   HTTP-level retry from #912.
5. **Backend signing.** `POST /api/uploads/signed`
   (`backend/src/routes/uploads.ts:162`) → `getUploadBucketUrl`
   (`backend/src/storage/index.ts:93`) → signs a **`PutObjectCommand` only**
   (`backend/src/storage/s3b2.ts:32`). No multipart API is signed today.

**"Multipart" in the current codebase is application-level** (one zip part =
one S3 object). There is **no** S3 multipart upload, no `UploadPart`, no
`ETag`/`partNumber` tracking, no `Range`/resume logic anywhere in
`packages/send` (verified by grep).

## 3. The hard constraint: ECE encryption boundaries

This is the crux that rules options in or out.

Each part is encrypted with **RFC 8188 ECE** (`src/lib/ece.ts`):

- Fixed records of `ECE_RECORD_SIZE = 65536` bytes (`ece.ts:12`); per-record
  overhead `OVERHEAD_SIZE = 17` (16-byte AES-GCM tag + 1 delimiter,
  `ece.ts:13`); one-time `HEADER_SIZE = 21` (salt + record size + flags,
  `ece.ts:14`).
- Records are **sequential and stateful**: `this.seq` starts at 0 (`ece.ts:35`)
  and the nonce for each record is derived from the base nonce XOR the record
  sequence number (`generateNonce(seq)`, `ece.ts:50`, called at `ece.ts:122`).

**Consequence:** within a single encrypted object you **cannot** resume at an
arbitrary plaintext byte offset. Record N's ciphertext and auth tag depend on
its sequence position; you cannot produce the bytes for "the second half" of an
ECE stream without having processed the first half. So **byte-range resume
inside one encrypted object is impossible without re-encrypting from zero** (or
redesigning the on-the-wire crypto format).

However — and this is what makes a cheap fix viable — **each application-level
part is already an independent ECE stream.** Re-uploading a single failed part
is cryptographically safe and self-contained; nothing couples part *i* to part
*j*.

## 4. Options

### Option A — Part-level resume (re-upload only failed split objects)

Track per-part upload status (client and/or server). On a session retry,
re-PUT only the parts that did not durably land; skip parts already confirmed
in B2.

- **Encryption:** No change. Parts are already independent ECE streams.
- **B2 compatibility:** Uses the existing single-PUT presign path. Fully
  compatible, no S3 multipart needed.
- **Storage/cost:** No new objects; same object count. Negligible.
- **Limitation:** Resolution is the **part size (100 MB)**. A stall at 99 MB of
  a 100 MB part still re-sends that whole part. It removes redundant re-sends of
  *sibling* parts and enables cross-session resume, but does not shrink the
  unit of loss within a part.
- **Effort:** Low–Medium. Mostly client orchestration + a "which parts exist"
  check; schema already has `Upload.part`.

### Option B — Smaller split size

Lower `SPLIT_SIZE` (e.g. 100 MB → 16–25 MB) so the unit of loss on any single
stall shrinks proportionally.

- **Encryption:** No change (more, smaller independent ECE streams).
- **B2 compatibility:** Full; existing path.
- **Storage/cost:** More objects per file → more presign round-trips, more
  `Upload`/`Item` rows, more B2 Class-B/C transactions. Roughly linear in part
  count. For a 1 GB file: 10 parts → ~40–64 parts.
- **Limitation:** A blunt instrument; trades transaction overhead for smaller
  blast radius. Pairs naturally with Option A (smaller parts make
  re-upload-failed-part cheap).
- **Effort:** Trivial (one constant), but it is a tuning lever, not a true
  resume mechanism.

### Option C — S3 multipart upload (per-part retry within an object)

B2 is S3-compatible and supports the S3 multipart API. Initiate a multipart
upload per object, upload encrypted records in ≥5 MB parts (S3 minimum part
size, except the last), retry individual parts, then complete.

- **Encryption:** Compatible **only if** we treat the ECE stream as an opaque
  byte sequence and cut S3 parts at **≥5 MB boundaries that we control while
  producing the stream** (buffer ECE output, flush a part once ≥5 MB
  accumulated). We do **not** need per-S3-part independent crypto — S3 parts
  are just byte ranges of the already-serialized ECE blob, reassembled
  server-side in order. The constraint from §3 is satisfied because we still
  encrypt sequentially; we just checkpoint the *ciphertext* at S3-part
  granularity. A part that fails re-sends only that ciphertext range (we must
  retain/re-derive those ciphertext bytes — easy if we buffer per-part before
  PUT).
- **B2 compatibility:** Requires verifying B2's S3 multipart support against
  `eu-central-003` (part size limits, max parts = 10,000, completion
  semantics, whether B2 charges per-part transactions). **Open item — must
  validate.**
- **Backend work:** New signed operations — `CreateMultipartUpload`,
  per-part presigned `UploadPart` URLs, `CompleteMultipartUpload`,
  `AbortMultipartUpload`. New tracking of upload ID + per-part `ETag`s.
- **Storage/cost:** Incomplete multipart uploads consume storage until aborted
  → need a lifecycle/abort policy. More transactions per object.
- **Effort:** High (frontend streaming/buffering + backend signing + new state
  machine + abort/cleanup).

### Option D — Application-level sub-chunking with a resume manifest

Split each object's ciphertext into N sub-chunk objects, upload each as its own
PUT, and store a manifest (order + hashes) to reassemble on download.

- **Encryption:** ECE stays sequential; sub-chunks are ciphertext ranges, so
  download must reassemble before decrypting (or we re-frame as N independent
  ECE streams, which changes the download path and per-chunk overhead).
- **B2 compatibility:** Full (single PUTs), but **download** and the
  decrypt/reassembly path both change — larger blast radius than C.
- **Storage/cost:** Many small objects + manifest; highest object-count growth.
- **Effort:** High, and touches the download/decryption path, which Options A–C
  largely leave alone.

## 5. Recommendation (phased)

**Phase 1 (ship now, cheap, high-leverage): Option A + Option B together.**
- Add **part-level resume**: confirm which parts already exist in storage before
  re-PUT; only re-send missing parts. Cross-session resumable at part
  granularity, zero crypto/backend-signing changes.
- Reduce `SPLIT_SIZE` from 100 MB to a smaller value (**propose 25 MB**, to be
  confirmed by the §6 validation) so the within-part loss unit shrinks and
  re-uploads are cheap. Quantify the extra B2 transaction cost for a 1 GB file
  before committing the number.

This combination directly satisfies AC-2 ("a transient mid-upload stall resumes
without re-sending already-uploaded bytes") at **part** granularity, with the
lowest risk, and composes with the already-merged #910/#912 tuning.

**Phase 2 (if Phase 1 is insufficient for very large single parts): Option C
(S3 multipart).** Pursue true intra-object resume only if validation shows that
even 25 MB parts stall often enough on the long-haul path to matter. Gate Phase
2 on the B2 S3-multipart compatibility check.

**Rejected:** Option D — it changes the download/decrypt path for no advantage
over C, and grows object count the most.

## 6. Validation plan (AC-3)

Validate against B2 **`eu-central-003`** with 100 MB+ files, from a
high-latency/long-haul path (the Sentry signal is Costa Rica → EU):

1. **Baseline:** reproduce the stall/`UPLOAD_FAILED` on `main` with a 100 MB
   single part; capture stall timing distribution.
2. **Phase 1 measurement:** with part-level resume + reduced `SPLIT_SIZE`,
   measure success rate and bytes-resent on induced stalls (e.g. throttle/drop
   mid-PUT). Confirm a stall resumes without re-sending completed parts.
3. **Cost:** record B2 transaction counts at 100 MB vs 25 MB parts for a 1 GB
   file; confirm the cost delta is acceptable.
4. **(Phase 2 gate) B2 multipart probe:** confirm `CreateMultipartUpload` /
   `UploadPart` / `CompleteMultipartUpload` behave on `eu-central-003`,
   including min part size and abort/lifecycle for incomplete uploads.

## 7. Open questions

- Exact `SPLIT_SIZE` target — needs the cost/reliability numbers from §6.
- Where to record per-part "durably uploaded" truth: trust existing `Upload`
  rows, or add an explicit confirmation (e.g. HEAD the object) before skipping
  on resume?
- Does B2's S3 gateway on `eu-central-003` charge per-part transactions, and
  what is its incomplete-multipart lifecycle? (Phase 2 gate.)
- Client-side resume state across page reloads: in-memory only, or persisted?

## References

- Issue: thunderbird/tbpro-add-on#913
- Sentry: https://thunderbird.sentry.io/issues/7459337313 (SEND-SUITE-FRONTEND-24H)
- Storage bench & rationale: thunderbird/platform-infrastructure#274
- Companion fixes: #910 (timeout 30→60s), #912 (retry backoff window)
- Encryption format: `packages/send/docs/Encryption.md`, `src/lib/ece.ts`

# Multipart Uploads

How TB Send uploads (and downloads) large files by splitting them into
independently-encrypted, independently-stored parts.

## Why multipart

Send encrypts every file in the browser and streams the ciphertext to object
storage (Backblaze B2 by default; also S3 or local filesystem). A single
multi-gigabyte upload is fragile: one dropped connection loses the whole
transfer, the browser must hold the whole encrypted blob, and a single object
PUT can exceed the request timeout. Splitting a file into fixed-size **parts**
makes each transfer small, bounded, and independently retryable.

## Key terms & data model

A multipart file is **not** one row — it is N sibling rows that share an
encryption key:

| Concept | Where | Notes |
|---|---|---|
| **Container** | `Container` table | A folder. `id` is a UUID (the `/send/folder/:id` route). |
| **Part** | `Item` table | One row *per part*. Carries `multipart: true`, `totalSize` (the full file size), `wrappedKey` (shared by all parts of the file), and points at one `Upload`. |
| **Storage object** | `Upload` table | One row per stored blob. Carries `size` (this part's encrypted size), `part` (1..N), `fileHash`. `id` is the storage key. |

So a file split into 3 parts produces **3 `Item` rows + 3 `Upload` rows**, all
`Item`s sharing the same `wrappedKey`, with `Upload.part` = 1, 2, 3.

The folder UI hides this: `organizeFiles()` shows only the `part === 1` item and
labels it with `totalSize`, so the user sees one file.

## Configuration

Defined in `frontend/src/lib/const.ts`:

- `SPLIT_SIZE = VITE_SPLIT_SIZE_IN_MB × 1,000,000` bytes (note: 1 MB = 1,000,000,
  decimal). Default 100 MB in code; overridable per environment via the
  `VITE_SPLIT_SIZE_IN_MB` build-time env var.
- `MAX_CONCURRENT_PARTS` — how many parts upload at once.
- A file is split only when `fileBlob.size > SPLIT_SIZE` (`shouldSplit`).

## Upload flow (frontend → backend → storage)

Entry point: `Uploader.doUpload()` in `frontend/src/lib/upload.ts`, called from
`DragAndDropUpload.vue` via `folderStore.uploadItem`.

### 1. Prepare
1. Look up the folder (container) wrapping key from the keychain.
2. Generate a fresh AES content key; wrap it with the container key →
   `wrappedKeyStr` (the same wrapped key is attached to every part).
3. Hash the file (`hashFiles`, per `SPLIT_SIZE` window) for integrity metadata.
4. If `shouldSplit`, `splitIntoMultipleZips(fileBlob, SPLIT_SIZE)` produces the
   array of part blobs; otherwise a single-element array.

### 2. Upload each part — `uploadPart(blob, index)`
For every part (concurrency-limited, see §3):

1. **Encrypt + PUT the bytes, exactly once** — `sendBlob(blob, key, api,
   partTracker, isBucketStorage, { signal, onUploadId })` in `filesync.ts`:
   - **Bucket storage (B2/S3):** `POST /api/uploads/signed` returns
     `{ id, url }` — a **presigned S3 PUT URL**. `onUploadId(id)` records the
     storage id immediately (bytes may land even if the PUT later fails, so the
     caller can clean it up). The chunk is encrypted, then `uploadWithTracker()`
     does an `XMLHttpRequest` PUT straight to the object store (browser →
     storage, bypassing the backend), honoring `XHR_TIMEOUT_MS` and the abort
     `signal`.
   - **Filesystem storage:** the ciphertext is streamed through the backend
     (`_upload`).
   - The PUT owns its own retry/backoff; `sendBlob` throws only once those are
     exhausted, so a transient network blip never re-encrypts the chunk.
2. **Confirm the object is in storage** — poll `GET /api/uploads/:id/stat`
   (→ `storage.length(id)`) until it reports a non-zero size.
3. **Create the DB rows** (retried independently, up to 5× with exponential
   backoff, since these are cheap POSTs):
   - `POST /api/uploads` `{ id, size, ownerId, type, containerId, part,
     fileHash }` → `createUpload()`. The backend **re-checks the stored size**
     (`storage.length(id) >= size`, since ciphertext ≥ plaintext) and rejects
     with `UPLOAD_SIZE_ERROR` if the object is short. Creates the `Upload` row.
   - `POST /api/containers/:id/item` `{ uploadId, name, wrappedKey, multipart,
     totalSize, part }` → creates the `Item` row.

### 3. Concurrency & failure handling
Parts run through a **bounded-concurrency pool**: up to `MAX_CONCURRENT_PARTS`
workers pull from a shared index, so as each part finishes the next queued one
starts immediately (no per-batch barrier). The whole upload shares one
`AbortController`:

- The **first part to fail permanently** records the error and calls
  `abortController.abort()`, which cancels the in-flight PUTs of sibling parts
  (they stop instead of running to completion).
- Then `deleteWrittenUploads()` → `POST /api/uploads/cleanup { ids }` removes
  every storage object this attempt started writing, so a partial failure
  leaves no orphaned bytes in the bucket.

## Download flow (reassembly)

Multipart download is the mirror image (`folder-store.ts` `downloadMultipart` +
`lib/folderView.ts`):

1. `computeMultipartFile(wrappedKey, items)` collects every `Item` in the folder
   sharing the file's `wrappedKey` → the list of parts.
2. `GET /api/uploads/:id/parts` and `/metadata` resolve each part's id/size/type;
   parts are sorted by `part` number.
3. Each part is fetched (bucket storage: `GET /api/download/:id/signed` → a
   presigned GET URL → download), **decrypted with the shared content key**, and
   the plaintext chunks are concatenated in part order.
4. The reassembled file is saved with the original name; its bytes are
   identical to the source (verified by SHA-256 checksum in testing).

## Storage backends

Selected by `STORAGE_BACKEND` (`backend/src/storage/index.ts`): `b2`, `s3`, or
`fs` (filesystem, the fallback). For B2/S3, uploads and downloads use
**presigned URLs** generated by an AWS-SDK S3 client (`storage/s3b2.ts`), so the
large-object bytes never transit the backend.

> ⚠️ Backend caveat: for B2 the storage adapter (`@tweedegolf/storage-abstraction`,
> `StorageType.B2`) uses the **native B2 API**, while the actual upload happens
> via the **S3-compatible presigned PUT** — and these two APIs are **not**
> immediately read-after-write consistent with each other. Because of this,
> `FileStore.length()` reads an object's size back through the **same S3 API**
> that wrote it (`HeadObject` via the direct S3 client) rather than the native
> `sizeOf`, so the create-entry size check and the `/stat` poll see the object
> immediately. See
> [UploadReliabilityOptimizations.md](./UploadReliabilityOptimizations.md).

## Sequence (one part, bucket storage)

```
browser                         backend                     object store (B2)
  |  POST /uploads/signed ------->|                                |
  |<---------- { id, url } -------|                                |
  |  (encrypt chunk)                                               |
  |  PUT <presigned url> -------------------------------------->  |  (bytes land)
  |  GET /uploads/:id/stat ------>| storage.length(id) --------->  |
  |<----------- { size } ---------|                                |
  |  POST /uploads --------------->| createUpload: size check ---> |
  |<---------- { upload } --------| (creates Upload row)           |
  |  POST /containers/:id/item -->| (creates Item row)             |
  |<---------- { item } ----------|                                |
```

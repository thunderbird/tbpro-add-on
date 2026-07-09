// Encrypts the Send passphrase at rest so it is never persisted as plaintext.
//
// This module is browser-only (IndexedDB + Web Crypto). crypto.subtle is a
// global in all modern browsers and Node 18+.
//
// Overview of the passphrase encryption flow:
//   1. A non-extractable AES-GCM-256 key is generated once and persisted in
//      IndexedDB so it survives page reloads without ever being exposed to JS.
//   2. When a passphrase needs to be stored, it is encrypted with that key
//      using a fresh random IV (encryptPassphrase). The result — IV + ciphertext
//      — is safe to keep in less-secure storage (localStorage, extension
//      storage) because without the IndexedDB key it is opaque.
//   3. When the passphrase is needed again, the stored payload is decrypted with
//      the same key (decryptPassphrase) and the plaintext is returned in memory.
//
// The IndexedDB key is per-origin. For the add-on that means all moz-extension
// pages (background, popup, management) share one key, so any of them can
// decrypt what another encrypted — mirroring how they already share localStorage.

// IndexedDB coordinates — the database, object-store, and key name under which
// the CryptoKey is persisted.
const DB_NAME = 'tb-secure-store';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_ID = 'passphrase-key';

// Serialisable representation of an encrypted passphrase. Both iv and data are
// stored as plain number arrays so they can be JSON-serialised and saved
// anywhere (localStorage, browser extension storage).
export interface EncryptedPassphrase {
  iv: number[]; // 12-byte AES-GCM initialisation vector
  data: number[]; // AES-GCM ciphertext + authentication tag
}

/** Type guard: does a stored value look like an EncryptedPassphrase payload? */
export function isEncryptedPassphrase(
  value: unknown
): value is EncryptedPassphrase {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as EncryptedPassphrase).iv) &&
    Array.isArray((value as EncryptedPassphrase).data)
  );
}

// Guard for environments that do not expose IndexedDB or Web Crypto (e.g. some
// service workers or non-browser test runners). Returns false when unavailable.
function isCryptoStorageAvailable(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined'
  );
}

// Opens (and, on first run, creates) the IndexedDB database.
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Retrieves the stored CryptoKey from IndexedDB, or null on first-time use.
function getKeyFromDb(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(KEY_ID);
    req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// Persists a CryptoKey into IndexedDB. The key is stored as a native CryptoKey
// object — the browser serialises it internally and it cannot be read back as
// raw bytes from JS.
function storeKeyInDb(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(key, KEY_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Single-flight guard: the promise for the (one) key load/creation, shared by
// all concurrent and subsequent callers. Prevents two first-time callers from
// each generating a different key and clobbering the other in IndexedDB (which
// would leave a passphrase encrypted under a key that no longer exists). Also
// avoids re-opening IndexedDB on every store/decrypt. Reset on failure so a
// transient error doesn't permanently poison the cache.
let cachedKeyPromise: Promise<CryptoKey | null> | null = null;

// Returns the AES-GCM encryption key, creating and persisting it on first call.
//
// The key is marked non-extractable (extractable: false) so the Web Crypto API
// will refuse any attempt to export the raw key bytes — limiting the attack
// surface to the IndexedDB store itself.
//
// Returns null when crypto storage is unavailable, signalling to callers that
// encrypted storage is not supported in the current environment.
export function getOrCreatePassphraseKey(): Promise<CryptoKey | null> {
  if (!isCryptoStorageAvailable()) return Promise.resolve(null);
  if (cachedKeyPromise) return cachedKeyPromise;

  cachedKeyPromise = (async () => {
    const db = await openDb();
    try {
      let key = await getKeyFromDb(db);
      if (!key) {
        // extractable: false prevents the raw key bytes from ever leaving the browser.
        key = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        await storeKeyInDb(db, key);
      }
      return key;
    } finally {
      db.close();
    }
  })().catch((err) => {
    // Don't cache a rejection — allow a retry on the next call.
    cachedKeyPromise = null;
    throw err;
  });

  return cachedKeyPromise;
}

// Encrypts a plaintext passphrase with the given AES-GCM key.
//
// A new 12-byte IV is generated for every call — reusing an IV with the same key
// would break AES-GCM's security guarantees, so this must never be skipped. The
// returned ciphertext includes the AES-GCM authentication tag appended by the
// browser.
export async function encryptPassphrase(
  key: CryptoKey,
  plaintext: string
): Promise<EncryptedPassphrase> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  };
}

// Decrypts an EncryptedPassphrase payload and returns the original plaintext.
//
// AES-GCM authenticates the ciphertext during decryption — if the data or the IV
// have been tampered with, crypto.subtle.decrypt rejects rather than returning
// corrupted plaintext.
export async function decryptPassphrase(
  key: CryptoKey,
  payload: EncryptedPassphrase
): Promise<string> {
  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

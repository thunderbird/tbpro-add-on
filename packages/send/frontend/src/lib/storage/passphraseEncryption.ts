// This module is browser-only (IndexedDB + Web Crypto).
// crypto.subtle is a global in all modern browsers and Node 18+.
//
// Overview of the passphrase encryption flow:
//   1. A non-extractable AES-GCM-256 key is generated once and persisted in
//      IndexedDB so it survives page reloads without ever being exposed to JS.
//   2. When a passphrase needs to be stored, it is encrypted with that key
//      using a fresh random IV (encryptPassphrase). The result — IV + ciphertext
//      — is safe to keep in less-secure storage (e.g. localStorage, sync storage)
//      because without the IndexedDB key it is opaque.
//   3. When the passphrase is needed again, the stored payload is decrypted with
//      the same key (decryptPassphrase) and the plaintext is returned in memory.

// IndexedDB coordinates — the database, object-store, and key name under which
// the CryptoKey is persisted.
const DB_NAME = 'tb-secure-store';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY_ID = 'passphrase-key';

// Serialisable representation of an encrypted passphrase.
// Both iv and data are stored as plain number arrays so they can be JSON-serialised
// and saved anywhere (e.g. browser extension storage).
export interface EncryptedPassphrase {
  iv: number[]; // 12-byte AES-GCM initialisation vector
  data: number[]; // AES-GCM ciphertext + authentication tag
}

// Guard for environments that do not expose IndexedDB (e.g. some service workers
// or non-browser test runners). Returns false when the API is absent.
function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

// Opens (and, on first run, creates) the IndexedDB database.
// The onupgradeneeded callback runs only when the database is new or the version
// number bumps, and it is responsible for creating the object store.
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      // Create the object store the first time the DB is initialised.
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Attempts to retrieve the stored CryptoKey from IndexedDB.
// Returns null when no key has been persisted yet (first-time use).
function getKeyFromDb(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(KEY_ID);
    req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// Persists a CryptoKey into IndexedDB under the well-known KEY_ID.
// The key is stored as a native CryptoKey object — the browser serialises it
// internally and it cannot be read back as raw bytes from JS.
function storeKeyInDb(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(key, KEY_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Returns the AES-GCM encryption key, creating and persisting it on first call.
//
// The key is marked non-extractable (extractable: false) so the Web Crypto API
// will refuse any attempt to export the raw key bytes — limiting the attack
// surface to the IndexedDB store itself.
//
// Returns null when IndexedDB is not available, signalling to callers that
// encrypted storage is not supported in the current environment.
export async function getOrCreatePassphraseKey(): Promise<CryptoKey | null> {
  if (!isIndexedDbAvailable()) return null;

  const db = await openDb();
  let key = await getKeyFromDb(db);

  if (!key) {
    // No key found — generate a fresh 256-bit AES-GCM key and store it.
    // extractable: false prevents the raw key bytes from ever leaving the browser.
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    await storeKeyInDb(db, key);
  }

  db.close();
  return key;
}

// Encrypts a plaintext passphrase with the given AES-GCM key.
//
// A new 12-byte IV is generated for every encryption call — reusing an IV with
// the same key would break AES-GCM's security guarantees, so this must never
// be skipped.
//
// The returned object contains both the IV and the ciphertext (which includes
// the AES-GCM authentication tag appended by the browser) as plain number arrays
// so the caller can serialise them freely.
export async function encryptPassphrase(
  key: CryptoKey,
  plaintext: string
): Promise<EncryptedPassphrase> {
  // Generate a fresh, cryptographically random 12-byte IV for this operation.
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encode the passphrase string to UTF-8 bytes before handing it to the cipher.
  const encoded = new TextEncoder().encode(plaintext);

  // Encrypt; the browser appends a 16-byte authentication tag to the ciphertext.
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Convert typed arrays to plain arrays for JSON-safe serialisation.
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  };
}

// Decrypts an EncryptedPassphrase payload and returns the original plaintext.
//
// AES-GCM authenticates the ciphertext during decryption — if the data or the IV
// have been tampered with, crypto.subtle.decrypt will throw and the caller will
// receive a rejection rather than corrupted plaintext.
export async function decryptPassphrase(
  key: CryptoKey,
  payload: EncryptedPassphrase
): Promise<string> {
  // Restore typed arrays from the stored plain-number representations.
  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);

  // Decrypt and verify the authentication tag in one step.
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // Decode the raw bytes back to a UTF-8 string and return it.
  return new TextDecoder().decode(decrypted);
}

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Domain separation so these tags can never collide with anything else this
// secret signs (JWTs use the same env secret).
const DOMAIN = 'send-upload-id-ownership-v1';

// The minted id must stay a standard uuid string (`Upload.id` is @db.Uuid and
// the id doubles as the storage key), so the tag is embedded in the uuid's
// last TAG_BYTES bytes: ~74 bits remain random (unguessable id) and 48 bits
// authenticate the minter — forging one means online-guessing a 48-bit MAC.
const TAG_BYTES = 6;
const PREFIX_BYTES = 16 - TAG_BYTES;

function getSecret(): string {
  const secret = process.env['ACCESS_TOKEN_SECRET'];
  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET must be set to mint upload ids');
  }
  return secret;
}

function ownershipTag(prefix: Buffer, ownerId: string): Buffer {
  return createHmac('sha256', getSecret())
    .update(DOMAIN)
    .update(prefix)
    .update(ownerId)
    .digest()
    .subarray(0, TAG_BYTES);
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Mints a valid uuidv4-shaped upload id bound to its requester. The id stays
 * opaque to clients and satisfies every existing uuid contract (row id, FK,
 * storage key); the embedded tag lets the server attribute a storage object
 * to its minter even when no `Upload` row was ever created
 * (see `deleteUploadsByIds`).
 */
export function mintOwnedUploadId(ownerId: string): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // uuid version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // uuid variant 10
  ownershipTag(bytes.subarray(0, PREFIX_BYTES), ownerId).copy(
    bytes,
    PREFIX_BYTES
  );
  return formatUuid(bytes);
}

/**
 * True only when `id` was minted by `mintOwnedUploadId` for this owner. A
 * fully random uuid (minted before ownership tags existed) never verifies —
 * those ids are unattributable by design.
 */
export function verifyOwnedUploadId(id: string, ownerId: string): boolean {
  const hex = id.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    return false;
  }
  const bytes = Buffer.from(hex, 'hex');
  const expected = ownershipTag(bytes.subarray(0, PREFIX_BYTES), ownerId);
  return timingSafeEqual(bytes.subarray(PREFIX_BYTES), expected);
}

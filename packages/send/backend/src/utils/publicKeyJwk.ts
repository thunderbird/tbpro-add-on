import { createPublicKey } from 'node:crypto';
import { z } from 'zod';

const base64url = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/)
    // A single trailing character cannot encode a whole byte.
    .refine((value) => value.length % 4 !== 1);

// Members of the public RSA-OAEP JWK that WebCrypto `exportKey('jwk')` returns.
const rsaPublicJwk = z.object({
  kty: z.literal('RSA'),
  n: base64url(4096),
  e: base64url(16),
  alg: z.string().max(32).optional(),
  ext: z.boolean().optional(),
  key_ops: z.array(z.string().max(16)).max(8).optional(),
});

const PUBLIC_MEMBERS = new Set(Object.keys(rsaPublicJwk.shape));
const MAX_JWK_JSON_LENGTH = 8192;
// Clients generate RSA-OAEP 2048-bit keys.
const MIN_MODULUS_BITS = 2048;

function isUsableRsaKey({ n, e }: { n?: string; e?: string }): boolean {
  const exponent = BigInt(
    '0x' + (Buffer.from(e ?? '', 'base64url').toString('hex') || '0')
  );
  if (exponent < BigInt(3) || exponent % BigInt(2) === BigInt(0)) {
    return false;
  }
  try {
    const key = createPublicKey({ key: { kty: 'RSA', n, e }, format: 'jwk' });
    return (key.asymmetricKeyDetails?.modulusLength ?? 0) >= MIN_MODULUS_BITS;
  } catch {
    return false;
  }
}

function fromJsonString(value: unknown): unknown {
  if (typeof value !== 'string' || value.length > MAX_JWK_JSON_LENGTH) {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Accepts the key as a JWK object or a JSON string of one (what clients send)
// and outputs its JSON once, keeping only public members in the order received.
export const publicKeyJwkSchema = z.unknown().transform((value, ctx) => {
  const raw = fromJsonString(value);
  const parsed = rsaPublicJwk.safeParse(raw);
  if (!parsed.success || !isUsableRsaKey(parsed.data)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'publicKey must be an RSA public key JWK',
    });
    return z.NEVER;
  }
  const members = Object.keys(raw as object).filter((key) =>
    PUBLIC_MEMBERS.has(key)
  );
  return JSON.stringify(raw, members);
});

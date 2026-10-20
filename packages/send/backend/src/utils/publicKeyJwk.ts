import { z } from 'zod';

const base64url = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/);

// Members of the public RSA-OAEP JWK that WebCrypto `exportKey('jwk')` returns.
const rsaPublicJwk = z.object({
  kty: z.literal('RSA'),
  n: base64url(4096),
  e: base64url(16),
  alg: z.string().max(32).optional(),
  ext: z.boolean().optional(),
  key_ops: z.array(z.string().max(16)).max(8).optional(),
});

const MAX_JWK_JSON_LENGTH = 8192;

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
  if (!rsaPublicJwk.safeParse(raw).success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'publicKey must be an RSA public key JWK',
    });
    return z.NEVER;
  }
  const members = Object.keys(raw as object).filter(
    (key) => key in rsaPublicJwk.shape
  );
  return JSON.stringify(raw, members);
});

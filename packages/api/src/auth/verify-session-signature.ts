// Copied verbatim from odin-api functions/src/auth/verify-session-signature.ts @ 4abad76 (import paths adjusted).
// Keep in sync with odin-api; do not edit locally.
import { createHash } from 'crypto';
import { Ed25519KeyIdentity, Ed25519PublicKey } from '@dfinity/identity';
import { p256 } from '@noble/curves/p256';

// SubjectPublicKeyInfo DER prefix for an ECDSA P-256 (prime256v1 / secp256r1)
// key, as emitted by `ECDSAKeyIdentity.generate().getPublicKey().toDer()`
// (WebCrypto SPKI export):
//   SEQUENCE (0x30 0x59)
//     SEQUENCE (0x30 0x13)
//       OID 1.2.840.10045.2.1 ecPublicKey
//         (0x06 0x07 0x2a 0x86 0x48 0xce 0x3d 0x02 0x01)
//       OID 1.2.840.10045.3.1.7 prime256v1
//         (0x06 0x08 0x2a 0x86 0x48 0xce 0x3d 0x03 0x01 0x07)
//     BIT STRING (0x03 0x42 0x00) followed by the 65-byte uncompressed point
//     (0x04 || X || Y).
// Total: 26-byte prefix + 65-byte raw key = 91 bytes. Verified empirically
// against `@dfinity/identity`'s `ECDSAKeyIdentity` before being hardcoded.
const P256_DER_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);
const P256_RAW_KEY_LENGTH = 65;
const P256_DER_LENGTH = P256_DER_PREFIX.length + P256_RAW_KEY_LENGTH;
// WebCrypto ECDSA P-256 signatures are 64-byte raw `r || s` (IEEE-P1363).
const P256_SIGNATURE_LENGTH = 64;

function toBytes(der: ArrayBuffer | Uint8Array): Uint8Array {
  return der instanceof Uint8Array ? der : new Uint8Array(der);
}

function isP256DerPubkey(der: ArrayBuffer | Uint8Array): boolean {
  const bytes = toBytes(der);
  if (bytes.length !== P256_DER_LENGTH) return false;
  for (let i = 0; i < P256_DER_PREFIX.length; i++) {
    if (bytes[i] !== P256_DER_PREFIX[i]) return false;
  }
  return true;
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

/**
 * Verify a login-challenge signature produced by a session key.
 *
 * Ed25519 (legacy SIWB / Internet Identity / NFID session keys) is verified
 * exactly as before — `Ed25519PublicKey.fromDer` validates the OID and throws
 * for any non-Ed25519 key (the controller's try/catch turns that into a 401).
 *
 * The only addition is a branch for the new non-extractable ECDSA **P-256**
 * (WebCrypto) session key: the frontend signs via `ECDSAKeyIdentity.sign`, i.e.
 * `crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ...)`, producing a
 * 64-byte raw `r || s` over `SHA-256(message)`.
 *
 * @param signingPubKey DER SubjectPublicKeyInfo of the session key.
 * @param signature 64-byte raw signature bytes.
 * @param message The signed message bytes (e.g. the UTF-8 timestamp), NOT
 *   pre-hashed — hashing for P-256 happens here.
 */
export function verifySessionKeySignature({
  signingPubKey,
  signature,
  message,
}: {
  signingPubKey: ArrayBuffer | Uint8Array;
  signature: Uint8Array;
  message: Uint8Array;
}): boolean {
  if (isP256DerPubkey(signingPubKey)) {
    if (signature.length !== P256_SIGNATURE_LENGTH) return false;
    const rawPubkey = toBytes(signingPubKey).slice(P256_DER_PREFIX.length);
    // lowS:false — WebCrypto's ECDSA does NOT normalise to low-S, so ~half of
    // valid signatures carry a high-S value; @noble's default `lowS:true` would
    // reject them and fail a legitimate login. (The delegation-chain secp256k1
    // path uses lowS:true on purpose because IC canister sigs require it; that
    // does NOT apply to a browser WebCrypto session signature.) @noble's
    // `verify` expects the message hash, so we pass sha256(message).
    return p256.verify(signature, sha256(message), rawPubkey, { lowS: false });
  }

  // Unchanged Ed25519 path (identical to the original inline verification).
  return Ed25519KeyIdentity.verify(
    signature,
    message,
    Ed25519PublicKey.fromDer(signingPubKey as never).rawKey,
  );
}

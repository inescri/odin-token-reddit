// Copied verbatim from odin-api functions/src/auth/verify-delegation-chain.ts @ 4abad76 (import paths adjusted).
// Keep in sync with odin-api; do not edit locally.
import { createHash } from 'crypto';
import { requestIdOf } from '@dfinity/agent';
import { Ed25519KeyIdentity, Ed25519PublicKey } from '@dfinity/identity';
import type { DelegationChain } from '@dfinity/identity';
import { secp256k1 } from '@noble/curves/secp256k1';
import { verifyCanisterSignature } from './verify-canister-signature.js';

// Matches the domain separator used by @dfinity/identity when signing a
// delegation (see _createSingleDelegation in delegation.js). Any signature
// in a DelegationChain is over (DOMAIN_SEPARATOR || requestIdOf(delegation)).
const DELEGATION_DOMAIN_SEPARATOR = new TextEncoder().encode(
  '\x1Aic-request-auth-delegation',
);

const ED25519_SIGNATURE_LENGTH = 64;
const SECP256K1_SIGNATURE_LENGTH = 64;

// SubjectPublicKeyInfo DER prefix for an Ed25519 key:
//   SEQUENCE (0x30 0x2a)
//     SEQUENCE (0x30 0x05)
//       OID 1.3.101.112 (0x06 0x03 0x2b 0x65 0x70)
//     BIT STRING (0x03 0x21 0x00) followed by the 32-byte raw key
// Total: 12-byte prefix + 32-byte key = 44 bytes.
const ED25519_DER_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);
const ED25519_DER_LENGTH = ED25519_DER_PREFIX.length + 32;

// SubjectPublicKeyInfo DER prefix for a secp256k1 ECDSA key (Plug wallet):
//   SEQUENCE (0x30 0x56)
//     SEQUENCE (0x30 0x10)
//       OID 1.2.840.10045.2.1 ecPublicKey (0x06 0x07 0x2a 0x86 0x48 0xce 0x3d 0x02 0x01)
//       OID 1.3.132.0.10       secp256k1   (0x06 0x05 0x2b 0x81 0x04 0x00 0x0a)
//     BIT STRING (0x03 0x42 0x00) followed by the 65-byte uncompressed point
//     (0x04 || X || Y).
// Total: 23-byte prefix + 65-byte raw key = 88 bytes.
const SECP256K1_DER_PREFIX = new Uint8Array([
  0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, 0x03, 0x42, 0x00,
]);
const SECP256K1_RAW_KEY_LENGTH = 65;
const SECP256K1_DER_LENGTH =
  SECP256K1_DER_PREFIX.length + SECP256K1_RAW_KEY_LENGTH;

function isEd25519DerPubkey(der: ArrayBuffer | Uint8Array): boolean {
  const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);
  if (bytes.length !== ED25519_DER_LENGTH) return false;
  for (let i = 0; i < ED25519_DER_PREFIX.length; i++) {
    if (bytes[i] !== ED25519_DER_PREFIX[i]) return false;
  }
  return true;
}

function isSecp256k1DerPubkey(der: ArrayBuffer | Uint8Array): boolean {
  const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);
  if (bytes.length !== SECP256K1_DER_LENGTH) return false;
  for (let i = 0; i < SECP256K1_DER_PREFIX.length; i++) {
    if (bytes[i] !== SECP256K1_DER_PREFIX[i]) return false;
  }
  return true;
}

function extractSecp256k1RawPubkey(der: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);
  return bytes.slice(SECP256K1_DER_PREFIX.length);
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

function buildDelegationChallenge(delegation: {
  pubkey: Uint8Array;
  expiration: bigint;
  targets?: unknown;
}): Uint8Array {
  const delegationMap: Record<string, unknown> = {
    pubkey: delegation.pubkey,
    expiration: delegation.expiration,
    targets: delegation.targets,
  };
  const requestId = requestIdOf(delegationMap);
  return new Uint8Array([
    ...DELEGATION_DOMAIN_SEPARATOR,
    ...new Uint8Array(requestId),
  ]);
}

/**
 * Cryptographically verify every signature in a DelegationChain.
 *
 * Hop 0 may be:
 *   - Ed25519 (Internet Identity session root, NFID, etc.): signature verified
 *     directly under `chain.publicKey`.
 *   - secp256k1 ECDSA (Plug wallet): signature is a 64-byte compact r||s over
 *     sha256(challenge); verified with @noble/curves with low-S enforcement.
 *   - Canister signature (SIWB / II canister-signed delegations): the
 *     signature blob is a CBOR-encoded IC certificate; verifyCanisterSignature
 *     validates it against the IC root key.
 *
 * Hops 1..N are always Ed25519 — the spec only allows non-Ed25519 keys at the
 * chain root.
 *
 * For each entry `delegations[i]`:
 *   - Build the challenge `DOMAIN_SEPARATOR || requestIdOf(delegation)`.
 *   - Verify `signature` under the *previous* public key (the chain root for
 *     `i=0`, otherwise `delegations[i-1].pubkey`).
 *
 * Returns true only if every hop verifies. Does NOT check expiration or
 * scope — callers should still run `isDelegationValid`.
 */
export async function verifyDelegationChain(
  chain: DelegationChain,
): Promise<boolean> {
  const rootDer = chain.publicKey;
  const rootIsEd25519 = isEd25519DerPubkey(rootDer);
  const rootIsSecp256k1 = isSecp256k1DerPubkey(rootDer);

  if (chain.delegations.length === 0) return false;

  for (let i = 0; i < chain.delegations.length; i++) {
    const { delegation, signature } = chain.delegations[i];
    const challenge = buildDelegationChallenge(delegation);

    const verifierDer: Uint8Array =
      i === 0 ? rootDer : chain.delegations[i - 1].delegation.pubkey;

    if (i === 0 && rootIsSecp256k1) {
      const sigBytes = new Uint8Array(signature);
      if (sigBytes.length !== SECP256K1_SIGNATURE_LENGTH) return false;

      const rawPubkey = extractSecp256k1RawPubkey(verifierDer);
      // IC spec requires low-S ECDSA signatures (BIP-0146); @noble/curves'
      // default is lowS:true, kept explicit so it isn't silently flipped.
      let isValid: boolean;
      try {
        isValid = secp256k1.verify(sigBytes, sha256(challenge), rawPubkey, {
          lowS: true,
        });
      } catch {
        return false;
      }
      if (!isValid) return false;
      continue;
    }

    const isCanisterSigHop = i === 0 && !rootIsEd25519;
    if (isCanisterSigHop) {
      const ok = await verifyCanisterSignature({
        rootDer: verifierDer,
        signatureBlob: signature,
        message: challenge,
      });
      if (!ok) return false;
      continue;
    }

    // Ed25519 hop.
    let rawPubkey: Uint8Array;
    try {
      rawPubkey = Ed25519PublicKey.fromDer(verifierDer as never).rawKey;
    } catch {
      return false;
    }

    const signatureBytes = new Uint8Array(signature);
    if (signatureBytes.length !== ED25519_SIGNATURE_LENGTH) return false;

    let isValid: boolean;
    try {
      isValid = Ed25519KeyIdentity.verify(signatureBytes, challenge, rawPubkey);
    } catch {
      return false;
    }
    if (!isValid) return false;
  }

  return true;
}

// Copied verbatim from odin-api functions/src/auth/verify-canister-signature.ts @ 4abad76 (import paths adjusted).
// Keep in sync with odin-api; do not edit locally.
import { createHash } from 'crypto';
// @icp-sdk/core (agent-js's successor) instead of @dfinity/agent: its
// Certificate supports the new top-level sharded `/canister_ranges/<subnet>`
// certificate path. Subnets stopped including the legacy
// `/subnet/<subnet>/canister_ranges` path in canister-signature certificates,
// which made @dfinity/agent's Certificate.create reject valid NFID/II
// delegations with "Could not find canister ranges for subnet ...".
import {
  Cbor,
  Certificate,
  IC_ROOT_KEY,
  LookupPathStatus,
  lookup_path,
  reconstruct,
} from '@icp-sdk/core/agent';
import type { HashTree } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';

// IC interface spec — Canister Signatures:
// https://internetcomputer.org/docs/current/references/ic-interface-spec/#canister-signatures
//
// Verification has three independent steps:
//   (1) BLS-verify the certificate against the IC root key (Certificate.create).
//   (2) Confirm the inner `tree`'s reconstructed root hash matches the
//       canister's certified_data leaf in the certificate.
//   (3) Confirm the inner tree contains a leaf at
//       `["sig", sha256(seed), sha256(message)]`.

interface CanisterSignaturePayload {
  certificate: Uint8Array;
  tree: HashTree;
}

interface CanisterSigPubkey {
  canisterId: Uint8Array;
  seed: Uint8Array;
}

const IC_ROOT_KEY_BYTES = Uint8Array.from(Buffer.from(IC_ROOT_KEY, 'hex'));

// AlgorithmIdentifier OID 1.3.6.1.4.1.56387.1.2 as ASN.1 OBJECT IDENTIFIER:
// tag 0x06, length 0x0a (10 content bytes), then the OID bytes themselves.
//   2b       1.3 (combined first two arcs: 1*40 + 3 = 43 = 0x2b)
//   06       .6
//   01       .1
//   04       .4
//   01       .1
//   83 b8 43 .56387 (base-128 with continuation bits: 56387 → 0x83 0xb8 0x43)
//   01       .1
//   02       .2
const CANISTER_SIG_OID_BYTES = new Uint8Array([
  0x06, 0x0a, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xb8, 0x43, 0x01, 0x02,
]);

/**
 * Parse a DER-encoded canister-signature SubjectPublicKeyInfo and extract the
 * signing canister id and seed.
 *
 * Layout:
 *   SEQUENCE { SEQUENCE { OID 1.3.6.1.4.1.56387.1.2 }, BIT STRING }
 *
 * BIT STRING contents (after the 0x00 unused-bits byte):
 *   <1 byte: canister_id length n>
 *   <n bytes: canister_id>
 *   <rest: seed>
 *
 * Returns null if the DER is not a canister-signature key or is malformed.
 */
export function parseCanisterSigPubkey(
  der: ArrayBuffer | Uint8Array,
): CanisterSigPubkey | null {
  const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);

  // Quickest correctness check: the canister-sig OID must appear in the
  // AlgorithmIdentifier near the start of the DER.
  if (!containsCanisterSigOid(bytes)) return null;

  let offset = 0;
  const outer = readTagAndLength(bytes, offset, 0x30); // outer SEQUENCE
  if (!outer) return null;
  offset = outer.contentStart;
  const outerEnd = outer.contentStart + outer.length;

  const algo = readTagAndLength(bytes, offset, 0x30); // algorithm SEQUENCE
  if (!algo) return null;
  offset = algo.contentStart + algo.length;

  const bitString = readTagAndLength(bytes, offset, 0x03);
  if (!bitString) return null;
  if (bitString.contentStart + bitString.length > outerEnd) return null;

  // First byte of BIT STRING content is the unused-bits count; must be 0
  // for byte-aligned canister-sig keys.
  if (bytes[bitString.contentStart] !== 0x00) return null;

  const keyStart = bitString.contentStart + 1;
  const keyEnd = bitString.contentStart + bitString.length;
  if (keyEnd <= keyStart + 1) return null;

  const canisterIdLen = bytes[keyStart];
  const canisterIdStart = keyStart + 1;
  const canisterIdEnd = canisterIdStart + canisterIdLen;
  if (canisterIdEnd > keyEnd) return null;

  const canisterId = bytes.slice(canisterIdStart, canisterIdEnd);
  const seed = bytes.slice(canisterIdEnd, keyEnd);

  return { canisterId, seed };
}

function readTagAndLength(
  bytes: Uint8Array,
  offset: number,
  expectedTag: number,
): { contentStart: number; length: number } | null {
  if (offset >= bytes.length) return null;
  if (bytes[offset] !== expectedTag) return null;

  const lengthByte = bytes[offset + 1];
  if (lengthByte === undefined) return null;

  if ((lengthByte & 0x80) === 0) {
    return { contentStart: offset + 2, length: lengthByte };
  }

  // Long-form length: lengthByte & 0x7f tells how many length bytes follow.
  const lengthOctets = lengthByte & 0x7f;
  if (lengthOctets === 0 || lengthOctets > 4) return null;
  if (offset + 2 + lengthOctets > bytes.length) return null;

  let length = 0;
  for (let i = 0; i < lengthOctets; i++) {
    length = length * 256 + bytes[offset + 2 + i];
  }
  if (length < 0 || !Number.isFinite(length)) return null;
  return { contentStart: offset + 2 + lengthOctets, length };
}

function containsCanisterSigOid(bytes: Uint8Array): boolean {
  // The OID block lives early in the DER (inside the algorithm SEQUENCE).
  // A short bounded scan is enough — we won't accept a chain where the OID
  // is buried in payload bytes far after the algorithm header.
  const scanLimit = Math.min(bytes.length, 64);
  outer: for (let i = 0; i + CANISTER_SIG_OID_BYTES.length <= scanLimit; i++) {
    for (let j = 0; j < CANISTER_SIG_OID_BYTES.length; j++) {
      if (bytes[i + j] !== CANISTER_SIG_OID_BYTES[j]) continue outer;
    }
    return true;
  }
  return false;
}

function sha256(data: ArrayBuffer | Uint8Array): Uint8Array {
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new Uint8Array(createHash('sha256').update(buffer).digest());
}

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Cryptographically verify an IC canister signature.
 *
 * @param rootDer The DER-encoded canister-signature public key (the chain root).
 * @param signatureBlob CBOR-encoded `{ certificate, tree }` produced by the canister.
 * @param message The message that was signed (for delegations: domain-separator || requestIdOf).
 *
 * Returns true only if the certificate verifies under the IC root key, the
 * inner tree's root hash matches the canister's certified_data, and the inner
 * tree contains a `["sig", sha256(seed), sha256(message)]` leaf.
 */
export async function verifyCanisterSignature(opts: {
  rootDer: ArrayBuffer | Uint8Array;
  signatureBlob: ArrayBuffer | Uint8Array;
  message: ArrayBuffer | Uint8Array;
}): Promise<boolean> {
  const parsed = parseCanisterSigPubkey(opts.rootDer);
  if (!parsed) return false;

  const { canisterId, seed } = parsed;

  let canisterPrincipal: Principal;
  try {
    canisterPrincipal = Principal.fromUint8Array(canisterId);
  } catch {
    return false;
  }

  let payload: CanisterSignaturePayload;
  try {
    const blob =
      opts.signatureBlob instanceof Uint8Array
        ? opts.signatureBlob
        : new Uint8Array(opts.signatureBlob);
    payload = Cbor.decode<CanisterSignaturePayload>(blob);
  } catch {
    return false;
  }

  if (!payload?.certificate || !payload?.tree) return false;

  let certificate: Certificate;
  try {
    certificate = await Certificate.create({
      certificate:
        payload.certificate instanceof Uint8Array
          ? payload.certificate
          : new Uint8Array(payload.certificate),
      rootKey: IC_ROOT_KEY_BYTES,
      principal: { canisterId: canisterPrincipal },
      // The certificate inside a canister signature is signed at the time the
      // canister last updated its certified_data, which can be older than the
      // 5-minute default window. The DelegationChain expiration check (run
      // separately by the caller via isDelegationValid) is what bounds replay.
      disableTimeVerification: true,
    });
  } catch {
    return false;
  }

  const certifiedDataLookup = certificate.lookup_path([
    'canister',
    canisterId,
    'certified_data',
  ]);
  if (certifiedDataLookup.status !== LookupPathStatus.Found) return false;
  if (!(certifiedDataLookup.value instanceof Uint8Array)) return false;
  const certifiedData = certifiedDataLookup.value;

  let innerRoot: Uint8Array;
  try {
    innerRoot = await reconstruct(payload.tree);
  } catch {
    return false;
  }

  if (!bytesEqual(innerRoot, certifiedData)) return false;

  // Look up the signature leaf in the inner tree.
  const seedHash = sha256(seed);
  const messageHash = sha256(opts.message);

  const sigLookup = lookup_path(
    [new TextEncoder().encode('sig'), seedHash, messageHash],
    payload.tree,
  );
  // The sig leaf's value is the empty byte string; only `Found` matters.
  return sigLookup.status === LookupPathStatus.Found;
}

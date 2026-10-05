/**
 * Client-side vault encryption (Web Crypto only, no dependencies).
 *
 * key      = PBKDF2-SHA256(masterPassword, salt, 600 000 iterations) → AES-GCM-256, non-extractable
 * item     = AES-GCM(key, iv = 12 random bytes, JSON(payload))
 * verifier = AES-GCM(key, VERIFIER_PLAINTEXT) — proves a password is correct without storing it
 *
 * The master password and key never leave the browser. If the master
 * password is forgotten the vault cannot be recovered — by design.
 */

export const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_PLAINTEXT = 'profjero-vault-v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { ciphertext: toB64(new Uint8Array(ct)), iv: toB64(iv) };
}

export async function decrypt(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
  return dec.decode(pt);
}

export async function createVerifier(key: CryptoKey) {
  const { ciphertext, iv } = await encrypt(key, VERIFIER_PLAINTEXT);
  return { verifier: ciphertext, verifierIv: iv };
}

export async function checkVerifier(key: CryptoKey, verifier: string, verifierIv: string): Promise<boolean> {
  try {
    return (await decrypt(key, verifier, verifierIv)) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

/** Unbiased random password from a cryptographic source (legacy used Math.random). */
export function generatePassword(length = 20, opts: { symbols?: boolean } = {}): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', ...(opts.symbols === false ? [] : ['!@#$%^&*-_=+?'])];
  const all = sets.join('');
  const pick = (alphabet: string) => {
    const limit = 256 - (256 % alphabet.length);
    for (;;) {
      const b = crypto.getRandomValues(new Uint8Array(1))[0]!;
      if (b < limit) return alphabet[b % alphabet.length]!;
    }
  };
  const chars = sets.map(pick); // at least one of each set
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

// Primitives cryptographiques du coffre.
// - Dérivation de clé : Argon2id (hash-wasm, WebAssembly)
// - Chiffrement : AES-256-GCM (Web Crypto, natif dans la WebView Android)
import { argon2id } from 'hash-wasm';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (s) => encoder.encode(s);
export const fromUtf8 = (b) => decoder.decode(b);

// Paramètres Argon2id par défaut : 64 Mio de mémoire, 3 passes.
// Environ 0,5 à 1,5 s sur un smartphone récent : lent pour un attaquant, acceptable pour l'utilisateur.
export const DEFAULT_KDF = Object.freeze({ algo: 'argon2id', m: 65536, t: 3, p: 1 });

export function b64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export function newKdfParams() {
  return { ...DEFAULT_KDF, salt: b64(randomBytes(16)) };
}

/** Dérive une clé AES-GCM (non exportable) à partir du mot de passe maître. */
export async function deriveKey(password, kdf) {
  if (!kdf || kdf.algo !== 'argon2id') throw new Error('Algorithme de dérivation inconnu');
  const raw = await argon2id({
    password: utf8(password.normalize('NFC')),
    salt: unb64(kdf.salt),
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: 'binary',
  });
  try {
    return await importAesKey(raw);
  } finally {
    raw.fill(0);
  }
}

export function importAesKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function aesEncrypt(key, plaintext, aad) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext);
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function aesDecrypt(key, box, aad) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(box.iv), additionalData: aad },
    key,
    unb64(box.ct),
  );
  return new Uint8Array(pt);
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Entier aléatoire uniforme dans [0, max) sans biais (échantillonnage par rejet). */
export function randomInt(max) {
  if (max <= 0 || max > 0x100000000) throw new RangeError('max invalide');
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

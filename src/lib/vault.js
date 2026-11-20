// Format et opérations du coffre.
//
// Schéma de clés :
//   mot de passe maître --Argon2id--> clé de déverrouillage (KEK)
//   KEK chiffre une "clé du coffre" (VK) aléatoire de 256 bits
//   VK chiffre les données (JSON des entrées + réglages)
// Changer le mot de passe maître ne fait que rechiffrer la VK.
// L'empreinte digitale protège une copie de la VK via le Keystore Android.
import {
  aesDecrypt,
  aesEncrypt,
  b64,
  deriveKey,
  fromUtf8,
  importAesKey,
  newKdfParams,
  randomBytes,
  unb64,
  utf8,
  uuid,
} from './crypto.js';

export const FORMAT = 'coffre-mdp';
export const VERSION = 1;
const AAD_KEY = utf8('coffre-mdp/v1/key');
const AAD_DATA = utf8('coffre-mdp/v1/data');
const HISTORY_LIMIT = 10;

export class WrongPasswordError extends Error {
  constructor() {
    super('Mot de passe incorrect');
    this.name = 'WrongPasswordError';
  }
}

export class InvalidFileError extends Error {
  constructor(msg = "Ce fichier n'est pas une sauvegarde Coffre valide") {
    super(msg);
    this.name = 'InvalidFileError';
  }
}

export const DEFAULT_SETTINGS = Object.freeze({
  autoLockSeconds: 60, // verrouillage après avoir quitté l'appli
  clipboardClearSeconds: 30, // effacement du presse-papier
});

export const DEFAULT_CATEGORIES = ['Personnel', 'Travail', 'Banque', 'Achats', 'Réseaux sociaux', 'Administratif'];

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function normalizeEntry(e) {
  const now = new Date().toISOString();
  return {
    id: str(e.id) || uuid(),
    title: str(e.title),
    username: str(e.username),
    password: str(e.password),
    url: str(e.url),
    notes: str(e.notes),
    category: str(e.category),
    favorite: Boolean(e.favorite),
    history: Array.isArray(e.history)
      ? e.history
          .filter((h) => h && typeof h.password === 'string')
          .map((h) => ({ password: h.password, changedAt: str(h.changedAt) || now }))
          .slice(0, HISTORY_LIMIT)
      : [],
    createdAt: str(e.createdAt) || now,
    updatedAt: str(e.updatedAt) || now,
  };
}

export function normalizeData(d) {
  const data = d && typeof d === 'object' ? d : {};
  return {
    version: 1,
    entries: Array.isArray(data.entries) ? data.entries.map(normalizeEntry) : [],
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
  };
}

export function newEntry(fields = {}) {
  const now = new Date().toISOString();
  return normalizeEntry({ ...fields, id: uuid(), createdAt: now, updatedAt: now, history: [] });
}

/** Applique une modification à une entrée en conservant l'historique des mots de passe. */
export function updateEntry(entry, changes) {
  const next = { ...entry, ...changes, updatedAt: new Date().toISOString() };
  if (changes.password !== undefined && changes.password !== entry.password && entry.password) {
    next.history = [{ password: entry.password, changedAt: next.updatedAt }, ...(entry.history || [])].slice(
      0,
      HISTORY_LIMIT,
    );
  }
  return normalizeEntry(next);
}

/** Crée un nouveau coffre vide. Retourne la session déverrouillée. */
export async function createVault(password) {
  const kdf = newKdfParams();
  const kek = await deriveKey(password, kdf);
  const vkRaw = randomBytes(32);
  const wrappedKey = await aesEncrypt(kek, vkRaw, AAD_KEY);
  return { kdf, wrappedKey, vkRaw, vk: await importAesKey(vkRaw), data: normalizeData({}) };
}

/** Chiffre la session en un objet fichier (sérialisable en JSON). */
export async function sealVault(session) {
  const data = await aesEncrypt(session.vk, utf8(JSON.stringify(session.data)), AAD_DATA);
  return {
    format: FORMAT,
    version: VERSION,
    kdf: session.kdf,
    wrappedKey: session.wrappedKey,
    data,
    savedAt: new Date().toISOString(),
  };
}

export function serializeVault(file) {
  return JSON.stringify(file, null, 1);
}

export function parseVaultFile(text) {
  let f;
  try {
    f = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : text;
  } catch {
    throw new InvalidFileError();
  }
  const okBox = (b) => b && typeof b.iv === 'string' && typeof b.ct === 'string';
  if (!f || f.format !== FORMAT || typeof f.version !== 'number') throw new InvalidFileError();
  if (f.version > VERSION) {
    throw new InvalidFileError('Cette sauvegarde vient d’une version plus récente de l’appli. Mettez l’appli à jour.');
  }
  if (!f.kdf || typeof f.kdf.salt !== 'string' || !okBox(f.wrappedKey) || !okBox(f.data)) {
    throw new InvalidFileError();
  }
  return f;
}

/** Déverrouille un fichier avec le mot de passe maître. */
export async function unlockWithPassword(file, password) {
  const kek = await deriveKey(password, file.kdf);
  let vkRaw;
  try {
    vkRaw = await aesDecrypt(kek, file.wrappedKey, AAD_KEY);
  } catch {
    throw new WrongPasswordError();
  }
  return unlockWithKey(file, vkRaw);
}

/** Déverrouille un fichier avec la clé du coffre brute (fournie par l'empreinte digitale). */
export async function unlockWithKey(file, vkRaw) {
  const raw = typeof vkRaw === 'string' ? unb64(vkRaw) : vkRaw;
  const vk = await importAesKey(raw);
  let pt;
  try {
    pt = await aesDecrypt(vk, file.data, AAD_DATA);
  } catch {
    throw new WrongPasswordError();
  }
  return {
    kdf: file.kdf,
    wrappedKey: file.wrappedKey,
    vkRaw: raw,
    vk,
    data: normalizeData(JSON.parse(fromUtf8(pt))),
  };
}

/** Vérifie le mot de passe maître de la session courante. */
export async function checkPassword(session, password) {
  try {
    const kek = await deriveKey(password, session.kdf);
    const raw = await aesDecrypt(kek, session.wrappedKey, AAD_KEY);
    return b64(raw) === b64(session.vkRaw);
  } catch {
    return false;
  }
}

/** Change le mot de passe maître (la clé du coffre reste la même). */
export async function changeMasterPassword(session, newPassword) {
  const kdf = newKdfParams();
  const kek = await deriveKey(newPassword, kdf);
  const wrappedKey = await aesEncrypt(kek, session.vkRaw, AAD_KEY);
  return { ...session, kdf, wrappedKey };
}

export const vaultKeyB64 = (session) => b64(session.vkRaw);

const fingerprint = (e) =>
  [e.title, e.url, e.username, e.password].map((s) => str(s).trim().toLowerCase()).join('\u0000');

/**
 * Fusionne des entrées importées dans la liste existante.
 * - même identifiant : la version la plus récente gagne
 * - doublon exact (titre, adresse, identifiant, mot de passe) : ignoré
 */
export function mergeEntries(existing, incoming) {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const prints = new Set(existing.map(fingerprint));
  const result = [...existing];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const raw of incoming) {
    const e = normalizeEntry(raw);
    const same = byId.get(e.id);
    if (same) {
      if (e.updatedAt > same.updatedAt) {
        result[result.indexOf(same)] = e;
        byId.set(e.id, e);
        updated++;
      } else skipped++;
      continue;
    }
    const fp = fingerprint(e);
    if (prints.has(fp)) {
      skipped++;
      continue;
    }
    prints.add(fp);
    byId.set(e.id, e);
    result.push(e);
    added++;
  }
  return { entries: result, added, updated, skipped };
}

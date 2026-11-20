// Lecture des exports CSV de gestionnaires de mots de passe
// (Google / Chrome, et par compatibilité Firefox, Bitwarden, Edge, Samsung Pass…).
import { newEntry } from './vault.js';

/** Analyse un CSV (RFC 4180) : guillemets, virgules et retours à la ligne dans les champs. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  // Détecte le séparateur sur la première ligne (virgule par défaut, point-virgule pour certains exports).
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === sep) {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const COLUMNS = {
  title: ['name', 'title', 'nom', 'titre', 'account', 'site', 'item name'],
  url: ['url', 'login_uri', 'website', 'web site', 'site web', 'uri', 'origin', 'adresse'],
  username: ['username', 'login_username', 'login', 'user', 'email', 'e-mail', 'identifiant', 'user name', 'utilisateur'],
  password: ['password', 'login_password', 'pass', 'mot de passe', 'passwd'],
  notes: ['note', 'notes', 'extra', 'comment', 'comments', 'commentaire', 'memo'],
  category: ['folder', 'grouping', 'group', 'category', 'catégorie', 'dossier'],
};

function mapHeader(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [key, names] of Object.entries(COLUMNS)) {
    const found = names.map((n) => norm.indexOf(n)).find((n) => n >= 0);
    if (found !== undefined) idx[key] = found;
  }
  return idx;
}

export function titleFromUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    if (u.protocol === 'android:') {
      // Chrome exporte les applis Android sous la forme android://hash@com.exemple.appli/
      const pkg = url.split('@').pop().replace(/\/$/, '');
      return pkg.split('.').filter((p) => !['com', 'fr', 'org', 'net', 'android', 'app'].includes(p)).pop() || pkg;
    }
    return u.hostname.replace(/^(www|m|login|accounts?|auth|secure)\./, '');
  } catch {
    return url;
  }
}

/**
 * Convertit un CSV en entrées du coffre.
 * Retourne { entries, ignored } ou lève une erreur si les colonnes sont introuvables.
 */
export function entriesFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 1) throw new Error('Le fichier est vide.');
  const idx = mapHeader(rows[0]);
  if (idx.password === undefined) {
    throw new Error('Colonne « password » introuvable. Ce fichier ne ressemble pas à un export de mots de passe.');
  }
  const get = (r, key) => (idx[key] === undefined ? '' : (r[idx[key]] || '').trim());
  const entries = [];
  let ignored = 0;
  for (const r of rows.slice(1)) {
    const password = idx.password === undefined ? '' : r[idx.password] || '';
    const username = get(r, 'username');
    const url = get(r, 'url');
    if (!password && !username) {
      ignored++;
      continue;
    }
    const rawTitle = get(r, 'title');
    entries.push(
      newEntry({
        title: rawTitle && rawTitle !== url ? rawTitle : titleFromUrl(url) || username || 'Sans titre',
        username,
        password,
        url: url.startsWith('android://') ? '' : url,
        notes: get(r, 'notes'),
        category: get(r, 'category'),
      }),
    );
  }
  return { entries, ignored };
}

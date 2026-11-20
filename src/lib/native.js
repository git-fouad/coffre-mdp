// Pont vers les fonctions natives Android (plugin Java "CoffreNative") avec repli navigateur
// pour pouvoir tester l'appli sur ordinateur.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = Capacitor.isNativePlatform();

// --- Repli navigateur -------------------------------------------------------
// ?fakebio dans l'adresse simule un capteur d'empreinte (tests uniquement, jamais sur Android).
const fakeBio = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fakebio');
let clipTimer = null;
const web = {
  async biometricStatus() {
    return fakeBio
      ? { available: true, enabled: Boolean(sessionStorage.getItem('fakebio')) }
      : { available: false, enabled: false, reason: 'Non disponible dans le navigateur' };
  },
  async biometricEnable({ secret }) {
    if (!fakeBio) throw new Error('Non disponible');
    sessionStorage.setItem('fakebio', secret);
  },
  async biometricUnlock() {
    const secret = sessionStorage.getItem('fakebio');
    if (!fakeBio || !secret) throw Object.assign(new Error('Non disponible'), { code: 'NOT_ENABLED' });
    return { secret };
  },
  async biometricDisable() {
    sessionStorage.removeItem('fakebio');
  },
  async copySecret({ text, clearAfterSeconds }) {
    await navigator.clipboard.writeText(text);
    clearTimeout(clipTimer);
    if (clearAfterSeconds > 0) {
      clipTimer = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), clearAfterSeconds * 1000);
    }
  },
  async clearClipboard() {
    await navigator.clipboard.writeText('').catch(() => {});
  },
};

const Native = registerPlugin('CoffreNative', { web: () => web });

export const biometric = {
  status: () => Native.biometricStatus(),
  enable: (secret) =>
    Native.biometricEnable({
      secret,
      title: 'Activer l’empreinte digitale',
      subtitle: 'Posez votre doigt pour confirmer',
      negative: 'Annuler',
    }),
  unlock: () =>
    Native.biometricUnlock({
      title: 'Déverrouiller Coffre',
      subtitle: 'Posez votre doigt sur le capteur',
      negative: 'Mot de passe',
    }),
  disable: () => Native.biometricDisable(),
};

export const copySecret = (text, clearAfterSeconds) => Native.copySecret({ text, clearAfterSeconds });
export const clearClipboard = () => Native.clearClipboard();

/** Erreurs du plugin qui signifient « l'utilisateur a annulé » : pas de message d'erreur à afficher. */
export function isCancel(err) {
  const code = err && (err.code || err.message);
  return /CANCEL|cancel|annul/i.test(String(code || ''));
}

// --- Fichiers ---------------------------------------------------------------

/** Ouvre le sélecteur de fichiers du système. Retourne un File, ou null si annulé. */
export function pickFile(accept = '') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (file) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

/** Propose d'enregistrer / partager un fichier texte (Drive, e-mail, Fichiers…). */
export async function shareTextFile(filename, text, title) {
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title, files: [uri], dialogTitle: title });
    return true;
  } catch (err) {
    if (isCancel(err)) return false;
    throw err;
  }
}

export async function cleanShareCache() {
  if (!isNative) return;
  try {
    const { files } = await Filesystem.readdir({ path: '', directory: Directory.Cache });
    for (const f of files) {
      if (/^coffre-sauvegarde-.*\.json$/.test(f.name)) {
        await Filesystem.deleteFile({ path: f.name, directory: Directory.Cache }).catch(() => {});
      }
    }
  } catch {
    // rien à nettoyer
  }
}

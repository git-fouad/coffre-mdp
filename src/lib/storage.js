// Stockage du coffre chiffré dans le dossier privé de l'appli (inaccessible aux autres applis).
// Une copie de la version précédente est conservée en cas d'écriture interrompue.
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { parseVaultFile } from './vault.js';

const FILE = 'vault.json';
const BACKUP = 'vault.prev.json';

async function readText(path) {
  try {
    const r = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  } catch {
    return null;
  }
}

async function writeText(path, data) {
  await Filesystem.writeFile({ path, data, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
}

/** Retourne le fichier coffre analysé, ou null s'il n'existe pas encore. */
export async function loadVaultFile() {
  for (const path of [FILE, BACKUP]) {
    const text = await readText(path);
    if (!text) continue;
    try {
      return parseVaultFile(text);
    } catch {
      // fichier abîmé : on tente la copie précédente
    }
  }
  return null;
}

export async function saveVaultText(text) {
  const current = await readText(FILE);
  if (current) {
    try {
      parseVaultFile(current);
      await writeText(BACKUP, current);
    } catch {
      // ne pas écraser une bonne copie de secours avec un fichier abîmé
    }
  }
  await writeText(FILE, text);
}

export async function deleteVault() {
  for (const path of [FILE, BACKUP]) {
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    } catch {
      // déjà absent
    }
  }
}

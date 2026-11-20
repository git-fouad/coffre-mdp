// Générateur de mots de passe et estimation de robustesse.
import { randomInt } from './crypto.js';

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&*+-=?@^_~()[]{}<>.,:;/',
};
const AMBIGUOUS = /[Il1O0o|`'"]/g;

export const DEFAULT_GEN = Object.freeze({
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
});

function pools(opts) {
  return ['lower', 'upper', 'digits', 'symbols']
    .filter((k) => opts[k])
    .map((k) => (opts.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
}

export function generatePassword(opts = DEFAULT_GEN) {
  const sets = pools(opts);
  if (!sets.length) sets.push(SETS.lower);
  const length = Math.max(sets.length, Math.min(128, opts.length | 0));
  const all = sets.join('');
  // Au moins un caractère de chaque famille choisie, le reste au hasard dans l'ensemble.
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function generatorEntropy(opts) {
  const size = pools(opts).join('').length || 26;
  return Math.round(Math.max(opts.length, 1) * Math.log2(size));
}

/** Estimation simple de l'entropie d'un mot de passe saisi (en bits). */
export function estimateEntropy(pw) {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  const unique = new Set(pw).size;
  // Pénalise les répétitions (« aaaaaaaa », « abababab »).
  const effectiveLength = Math.min(pw.length, unique * 2 + Math.log2(pw.length + 1));
  let bits = effectiveLength * Math.log2(Math.max(pool, 2));
  if (/^(.)\1+$/.test(pw) || /^(0123|1234|azer|qwer|abcd|pass|mot ?de ?passe|motdepasse)/i.test(pw)) bits *= 0.5;
  return Math.round(bits);
}

export function strengthLabel(bits) {
  if (bits < 40) return { level: 1, label: 'Faible' };
  if (bits < 60) return { level: 2, label: 'Moyen' };
  if (bits < 80) return { level: 3, label: 'Bon' };
  return { level: 4, label: 'Excellent' };
}

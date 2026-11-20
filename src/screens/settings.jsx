// Réglages, changement du mot de passe maître et import depuis Chrome.
import { useEffect, useState } from 'preact/hooks';
import { ArrowLeft, ChevronRight, Download, FileUp, KeyRound, ShieldCheck, Trash2, Upload } from 'lucide-preact';
import { daysSince, formatDate, Header, IconButton, PasswordInput, StrengthMeter, Toggle, useApp } from '../ui.jsx';
import { masterPasswordProblem } from './lock.jsx';
import { entriesFromCsv } from '../lib/csv.js';
import { pickFile } from '../lib/native.js';
import { changeMasterPassword, checkPassword, mergeEntries } from '../lib/vault.js';

const LOCK_CHOICES = [
  [0, 'Immédiatement'],
  [30, 'Après 30 secondes'],
  [60, 'Après 1 minute'],
  [300, 'Après 5 minutes'],
  [900, 'Après 15 minutes'],
];
const CLIP_CHOICES = [
  [15, '15 secondes'],
  [30, '30 secondes'],
  [60, '1 minute'],
  [120, '2 minutes'],
  [0, 'Jamais'],
];

function Choice({ id, label, hint, value, choices, onChange }) {
  return (
    <div class="select-row">
      <label for={id} class="toggle-text">
        <span class="toggle-label">{label}</span>
        {hint && <span class="toggle-hint">{hint}</span>}
      </label>
      <select id={id} class="select" value={value} onChange={(e) => onChange(Number(e.currentTarget.value))}>
        {choices.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Row({ icon: Icon, label, hint, onClick, danger }) {
  return (
    <button type="button" class={`row-btn ${danger ? 'row-btn--danger' : ''}`} onClick={onClick}>
      <Icon size={20} aria-hidden="true" />
      <span class="toggle-text">
        <span class="toggle-label">{label}</span>
        {hint && <span class="toggle-hint">{hint}</span>}
      </span>
      <ChevronRight size={18} aria-hidden="true" class="row-chevron" />
    </button>
  );
}

export function SettingsScreen() {
  const app = useApp();
  const { settings, entries } = app.data;
  const [bioBusy, setBioBusy] = useState(false);
  const setSetting = (k, v) => app.saveSettings({ [k]: v });
  const age = daysSince(settings.lastBackupAt);

  const toggleBio = async (on) => {
    setBioBusy(true);
    if (on) await app.enableBiometric();
    else await app.disableBiometric();
    setBioBusy(false);
  };

  return (
    <main class="screen">
      <Header title="Réglages" left={<IconButton icon={ArrowLeft} label="Retour" onClick={app.pop} />} />
      <div class="content">
        <h2 class="section">Sécurité</h2>
        <div class="group">
          <Toggle
            label="Déverrouiller avec l’empreinte"
            hint={app.bio.available ? 'Le mot de passe maître reste demandé si les empreintes changent.' : app.bio.reason}
            checked={app.bio.enabled}
            disabled={bioBusy || (!app.bio.available && !app.bio.enabled)}
            onChange={toggleBio}
          />
          <Choice
            id="s-lock"
            label="Verrouiller le coffre"
            hint="Après avoir quitté l’appli. Il se verrouille aussi après 5 minutes sans activité."
            value={settings.autoLockSeconds}
            choices={LOCK_CHOICES}
            onChange={(v) => setSetting('autoLockSeconds', v)}
          />
          <Choice
            id="s-clip"
            label="Effacer le presse-papier"
            hint="Après avoir copié un mot de passe."
            value={settings.clipboardClearSeconds}
            choices={CLIP_CHOICES}
            onChange={(v) => setSetting('clipboardClearSeconds', v)}
          />
          <Row icon={KeyRound} label="Changer le mot de passe maître" onClick={() => app.push({ name: 'change-password' })} />
        </div>

        <h2 class="section">Sauvegarde</h2>
        <div class="group">
          <Row
            icon={Download}
            label="Exporter une sauvegarde"
            hint={
              settings.lastBackupAt
                ? `Dernière le ${formatDate(settings.lastBackupAt)}${age > 30 ? '. Pensez à en refaire une.' : ''}`
                : 'Fichier chiffré à garder sur Google Drive, par e-mail ou sur un ordinateur.'
            }
            onClick={app.exportBackup}
          />
          <Row
            icon={Upload}
            label="Importer une sauvegarde"
            hint="Ajoute les mots de passe d’un fichier de sauvegarde Coffre à ceux déjà présents."
            onClick={app.importBackup}
          />
          <Row
            icon={FileUp}
            label="Importer depuis Chrome"
            hint="Fichier CSV exporté du gestionnaire de mots de passe Google."
            onClick={() => app.push({ name: 'import-csv' })}
          />
        </div>

        <h2 class="section">Zone sensible</h2>
        <div class="group">
          <Row
            icon={Trash2}
            label="Effacer le coffre"
            hint={entries.length ? `Supprime ${entries.length > 1 ? `les ${entries.length} mots` : 'le mot'} de passe de ce téléphone.` : 'Le coffre est vide.'}
            onClick={app.resetVault}
            danger
          />
        </div>

        <div class="about">
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            Coffre {app.version}. Vos mots de passe restent sur ce téléphone, chiffrés avec AES-256 et une clé dérivée de
            votre mot de passe maître (Argon2id). L’appli n’a pas accès à Internet.
          </p>
        </div>
      </div>
    </main>
  );
}

export function ChangePasswordScreen() {
  const app = useApp();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    const problem = masterPasswordProblem(pw, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    if (!(await checkPassword(app.session(), current))) {
      setBusy(false);
      setError('Le mot de passe actuel est incorrect.');
      return;
    }
    const next = await changeMasterPassword(app.session(), pw);
    await app.replaceSession(next);
    setBusy(false);
    app.pop();
    app.toast('Mot de passe maître changé. Les anciennes sauvegardes gardent l’ancien : refaites-en une.', 'info', 6000);
  };

  return (
    <main class="screen">
      <Header title="Mot de passe maître" left={<IconButton icon={ArrowLeft} label="Retour" onClick={app.pop} />} />
      <div class="content form">
        <label class="label" for="cp-cur">
          Mot de passe actuel
        </label>
        <PasswordInput id="cp-cur" value={current} onInput={setCurrent} autoFocus />
        <label class="label" for="cp-new">
          Nouveau mot de passe
        </label>
        <PasswordInput id="cp-new" value={pw} onInput={setPw} />
        <StrengthMeter password={pw} />
        <label class="label" for="cp-conf">
          Confirmez le nouveau
        </label>
        <PasswordInput id="cp-conf" value={confirm} onInput={setConfirm} onEnter={submit} />
        {error && <p class="form-error">{error}</p>}
        <button type="button" class="btn btn--primary btn--block" onClick={submit} disabled={busy || !current || !pw}>
          {busy ? 'Changement en cours…' : 'Changer le mot de passe'}
        </button>
      </div>
    </main>
  );
}

export function ImportCsvScreen() {
  const app = useApp();
  const [result, setResult] = useState(null); // { entries, ignored, merge }
  const [error, setError] = useState('');

  useEffect(() => app.setBackHandler(null), []);

  const choose = async () => {
    setError('');
    const file = await app.withoutAutoLock(() => pickFile());
    if (!file) return;
    try {
      const parsed = entriesFromCsv(await file.text());
      const merge = mergeEntries(app.data.entries, parsed.entries);
      setResult({ ...parsed, merge, name: file.name });
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmImport = async () => {
    await app.saveEntries(result.merge.entries);
    app.pop();
    app.toast(
      `${result.merge.added} mot${result.merge.added > 1 ? 's' : ''} de passe importé${result.merge.added > 1 ? 's' : ''}. Supprimez maintenant le fichier CSV : il n’est pas chiffré.`,
      'info',
      7000,
    );
  };

  return (
    <main class="screen">
      <Header title="Importer depuis Chrome" left={<IconButton icon={ArrowLeft} label="Retour" onClick={app.pop} />} />
      <div class="content">
        {!result ? (
          <>
            <ol class="steps">
              <li>
                Sur le téléphone, ouvrez <strong>Chrome</strong>, puis le menu ⋮ → <strong>Gestionnaire de mots de passe Google</strong>{' '}
                → <strong>Paramètres</strong> (roue dentée).
              </li>
              <li>
                Touchez <strong>Exporter les mots de passe</strong> et enregistrez le fichier CSV dans <strong>Téléchargements</strong>.
              </li>
              <li>Revenez ici et choisissez ce fichier.</li>
            </ol>
            <p class="hint-text">
              Les fichiers exportés de Firefox, Bitwarden, Edge ou Samsung Pass au format CSV fonctionnent aussi.
            </p>
            {error && <p class="form-error">{error}</p>}
            <button type="button" class="btn btn--primary btn--block" onClick={choose}>
              <FileUp size={18} aria-hidden="true" /> Choisir le fichier CSV
            </button>
          </>
        ) : (
          <>
            <div class="group summary">
              <p>
                <strong>{result.entries.length}</strong> mot{result.entries.length > 1 ? 's' : ''} de passe trouvé
                {result.entries.length > 1 ? 's' : ''} dans {result.name}.
              </p>
              {result.merge.skipped > 0 && <p>{result.merge.skipped} déjà présent{result.merge.skipped > 1 ? 's' : ''} dans le coffre, ignoré{result.merge.skipped > 1 ? 's' : ''}.</p>}
              {result.ignored > 0 && <p>{result.ignored} ligne{result.ignored > 1 ? 's' : ''} vide{result.ignored > 1 ? 's' : ''} ignorée{result.ignored > 1 ? 's' : ''}.</p>}
            </div>
            {result.merge.added > 0 ? (
              <button type="button" class="btn btn--primary btn--block" onClick={confirmImport}>
                Importer {result.merge.added} mot{result.merge.added > 1 ? 's' : ''} de passe
              </button>
            ) : (
              <p class="hint-text">Rien de nouveau à importer.</p>
            )}
            <button type="button" class="btn btn--ghost btn--block" onClick={() => setResult(null)}>
              Choisir un autre fichier
            </button>
            <p class="hint-text">
              Après l’import, supprimez le fichier CSV de vos Téléchargements : il contient vos mots de passe en clair.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

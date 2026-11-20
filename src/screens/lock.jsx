// Premier lancement (création / restauration) et écran de verrouillage.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Fingerprint, FileUp } from 'lucide-preact';
import { Dial, PasswordInput, StrengthMeter, useApp } from '../ui.jsx';
import { estimateEntropy } from '../lib/generator.js';
import { biometric, isCancel, pickFile } from '../lib/native.js';
import {
  createVault,
  parseVaultFile,
  unlockWithKey,
  unlockWithPassword,
  WrongPasswordError,
} from '../lib/vault.js';

export const MIN_MASTER_LENGTH = 10;

export function masterPasswordProblem(pw, confirm) {
  if (pw.length < MIN_MASTER_LENGTH) return `Au moins ${MIN_MASTER_LENGTH} caractères.`;
  if (estimateEntropy(pw) < 40) return 'Trop facile à deviner. Ajoutez des mots, des chiffres ou des symboles.';
  if (confirm !== undefined && pw !== confirm) return 'Les deux saisies ne correspondent pas.';
  return '';
}

export function SetupScreen({ onReady }) {
  const app = useApp();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const problem = masterPasswordProblem(pw, confirm);

  const create = async () => {
    setTried(true);
    if (problem || !understood) return;
    setBusy(true);
    try {
      const session = await createVault(pw);
      await onReady(session, { isNew: true });
    } catch (err) {
      app.toast(`Création impossible : ${err.message}`, 'error');
      setBusy(false);
    }
  };

  const restore = async () => {
    const file = await app.withoutAutoLock(() => pickFile());
    if (!file) return;
    let parsed;
    try {
      parsed = parseVaultFile(await file.text());
    } catch (err) {
      app.toast(err.message, 'error');
      return;
    }
    let session = null;
    const ok = await app.askPassword({
      title: 'Restaurer la sauvegarde',
      message: 'Saisissez le mot de passe maître utilisé au moment de cette sauvegarde.',
      confirmLabel: 'Restaurer',
      onSubmit: async (p) => {
        try {
          session = await unlockWithPassword(parsed, p);
          return null;
        } catch (err) {
          return err instanceof WrongPasswordError ? 'Mot de passe incorrect.' : err.message;
        }
      },
    });
    if (ok && session) await onReady(session, { restored: session.data.entries.length });
  };

  return (
    <main class="screen screen--vault">
      <div class="vault-top">
        <Dial state={busy ? 'busy' : 'idle'} />
        <h1 class="vault-title">Créez votre coffre</h1>
        <p class="vault-lead">
          Un seul mot de passe maître protège tous les autres. Une courte phrase est plus facile à retenir et plus
          solide qu’un mot compliqué.
        </p>
      </div>
      <div class="vault-form">
        <label class="label" for="pw1">
          Mot de passe maître
        </label>
        <PasswordInput id="pw1" value={pw} onInput={setPw} placeholder="ex. : Cerise-Tram-Lundi-42" />
        <StrengthMeter password={pw} />
        <label class="label" for="pw2">
          Confirmez-le
        </label>
        <PasswordInput id="pw2" value={confirm} onInput={setConfirm} onEnter={create} />
        <label class="check">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.currentTarget.checked)} />
          <span>J’ai compris : si j’oublie ce mot de passe, personne ne pourra récupérer mes données.</span>
        </label>
        {tried && (problem || !understood) && (
          <p class="form-error">{problem || 'Cochez la case pour continuer.'}</p>
        )}
        <button type="button" class="btn btn--primary btn--block" onClick={create} disabled={busy}>
          {busy ? 'Création du coffre…' : 'Créer mon coffre'}
        </button>
        <button type="button" class="btn btn--ghost btn--block" onClick={restore} disabled={busy}>
          <FileUp size={18} aria-hidden="true" /> Restaurer une sauvegarde
        </button>
      </div>
    </main>
  );
}

export function LockScreen({ file, bio, autoPrompt, onUnlocked, onBioInvalid }) {
  const app = useApp();
  const [pw, setPw] = useState('');
  const [state, setState] = useState('idle'); // idle | busy | error | open
  const [error, setError] = useState('');
  const prompted = useRef(false);

  const finish = async (session) => {
    setState('open');
    await new Promise((r) => setTimeout(r, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 380));
    onUnlocked(session);
  };

  const unlock = async () => {
    if (!pw || state === 'busy') return;
    setState('busy');
    setError('');
    try {
      const session = await unlockWithPassword(file, pw);
      await finish(session);
    } catch (err) {
      setState('error');
      setError(err instanceof WrongPasswordError ? 'Mot de passe incorrect.' : `Erreur : ${err.message}`);
      setPw('');
    }
  };

  const unlockBio = async () => {
    if (state === 'busy') return;
    try {
      const { secret } = await biometric.unlock();
      setState('busy');
      const session = await unlockWithKey(file, secret);
      await finish(session);
    } catch (err) {
      setState('idle');
      if (isCancel(err)) return;
      if (err && (err.code === 'INVALIDATED' || err instanceof WrongPasswordError)) {
        await onBioInvalid();
        setError('Les empreintes du téléphone ont changé. Saisissez votre mot de passe, puis réactivez l’empreinte dans les réglages.');
        return;
      }
      setError(err && err.message ? err.message : 'Empreinte non reconnue.');
    }
  };

  useEffect(() => {
    if (bio.enabled && autoPrompt && !prompted.current) {
      prompted.current = true;
      unlockBio();
    }
  }, [bio.enabled, autoPrompt]);

  return (
    <main class="screen screen--vault">
      <div class="vault-top">
        <Dial state={state} />
        <h1 class="vault-title">Coffre verrouillé</h1>
      </div>
      <div class="vault-form">
        <label class="label" for="master">
          Mot de passe maître
        </label>
        <PasswordInput
          id="master"
          value={pw}
          onInput={(v) => {
            setPw(v);
            if (state === 'error') setState('idle');
          }}
          onEnter={unlock}
          autoFocus={!bio.enabled}
          autocomplete="current-password"
        />
        {error && <p class="form-error">{error}</p>}
        <button type="button" class="btn btn--primary btn--block" onClick={unlock} disabled={!pw || state === 'busy'}>
          {state === 'busy' ? 'Ouverture…' : 'Déverrouiller'}
        </button>
        {bio.enabled && (
          <button type="button" class="btn btn--ghost btn--block" onClick={unlockBio} disabled={state === 'busy'}>
            <Fingerprint size={20} aria-hidden="true" /> Utiliser l’empreinte
          </button>
        )}
      </div>
    </main>
  );
}

/** Proposé juste après la création du coffre. */
export function BiometricOffer({ onDone }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true);
    const ok = await app.enableBiometric();
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <main class="screen screen--vault">
      <div class="vault-top">
        <div class="bio-badge" aria-hidden="true">
          <Fingerprint size={56} strokeWidth={1.5} />
        </div>
        <h1 class="vault-title">Déverrouiller avec l’empreinte ?</h1>
        <p class="vault-lead">
          Plus besoin de retaper le mot de passe maître à chaque ouverture. Il reste demandé si les empreintes du
          téléphone changent.
        </p>
      </div>
      <div class="vault-form">
        <button type="button" class="btn btn--primary btn--block" onClick={enable} disabled={busy}>
          <Fingerprint size={20} aria-hidden="true" /> Activer l’empreinte
        </button>
        <button type="button" class="btn btn--ghost btn--block" onClick={onDone} disabled={busy}>
          Plus tard
        </button>
      </div>
    </main>
  );
}

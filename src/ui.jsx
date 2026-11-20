// Composants d'interface partagés.
import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { Check, Copy, Eye, EyeOff, X } from 'lucide-preact';
import { estimateEntropy, strengthLabel } from './lib/generator.js';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function IconButton({ icon: Icon, label, onClick, tone, size = 22, disabled, class: cls = '' }) {
  return (
    <button
      type="button"
      class={`icon-btn ${tone ? `icon-btn--${tone}` : ''} ${cls}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={size} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

/** Bouton copier qui affiche une coche pendant un instant. */
export function CopyButton({ text, label = 'Copier', what }) {
  const { copy } = useApp();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <IconButton
      icon={done ? Check : Copy}
      label={label}
      tone={done ? 'ok' : undefined}
      onClick={async (e) => {
        e.stopPropagation();
        if (await copy(text, what)) setDone(true);
      }}
    />
  );
}

/** Affiche un mot de passe : chiffres et symboles colorés pour faciliter la lecture. */
export function PasswordText({ value, reveal }) {
  if (!reveal) {
    return (
      <span class="pw pw--masked" aria-label="Mot de passe masqué">
        ••••••••••••
      </span>
    );
  }
  if (!value) return <span class="pw pw--empty">Aucun</span>;
  return (
    <span class="pw">
      {[...value].map((c, i) => (
        <span key={i} class={/[0-9]/.test(c) ? 'pw-d' : /[a-zA-Z]/.test(c) ? undefined : 'pw-s'}>
          {c}
        </span>
      ))}
    </span>
  );
}

const MONO_HUES = [205, 160, 32, 280, 350, 120, 250, 15];
export function Monogram({ title, size = 'md' }) {
  const t = (title || '?').trim();
  let h = 0;
  for (const c of t.toLowerCase()) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const hue = MONO_HUES[h % MONO_HUES.length];
  const letter = (t.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
  return (
    <span class={`mono mono--${size}`} style={{ '--h': hue }} aria-hidden="true">
      {letter}
    </span>
  );
}

export function StrengthMeter({ password, bits }) {
  const b = bits ?? estimateEntropy(password || '');
  const s = strengthLabel(b);
  if (!password && bits == null) return null;
  return (
    <div class={`strength strength--${s.level}`} aria-live="polite">
      <div class="strength-bar">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} class={n <= s.level ? 'on' : ''} />
        ))}
      </div>
      <span class="strength-label">
        {s.label} ({b} bits)
      </span>
    </div>
  );
}

export function PasswordInput({ value, onInput, placeholder, autoFocus, id, autocomplete = 'off', onEnter }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);
  return (
    <div class="input-wrap">
      <input
        ref={ref}
        id={id}
        class="input input--pw"
        type={show ? 'text' : 'password'}
        value={value}
        onInput={(e) => onInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter();
        }}
        placeholder={placeholder}
        autocomplete={autocomplete}
        autocapitalize="off"
        autocorrect="off"
        spellcheck={false}
      />
      <IconButton
        icon={show ? EyeOff : Eye}
        label={show ? 'Masquer' : 'Afficher'}
        onClick={() => setShow(!show)}
        class="input-action"
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label class={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <span class="toggle-text">
        <span class="toggle-label">{label}</span>
        {hint && <span class="toggle-hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  );
}

export function Header({ title, left, right, sub }) {
  return (
    <header class="bar">
      <div class="bar-side">{left}</div>
      <div class="bar-title">
        <h1>{title}</h1>
        {sub && <span class="bar-sub">{sub}</span>}
      </div>
      <div class="bar-side bar-side--end">{right}</div>
    </header>
  );
}

/** Boîte de dialogue : confirmation ou saisie de mot de passe. */
export function Dialog({ dialog, close }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!dialog) return null;

  const submit = async () => {
    if (dialog.kind === 'password') {
      if (!pw) return;
      if (dialog.onSubmit) {
        setBusy(true);
        setError('');
        const err = await dialog.onSubmit(pw);
        setBusy(false);
        if (err) {
          setError(err);
          return;
        }
      }
      close(pw);
    } else close(true);
  };

  return (
    <div class="scrim" onClick={() => !busy && close(null)}>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-head">
          <h2 id="dlg-title">{dialog.title}</h2>
          <IconButton icon={X} label="Fermer" onClick={() => !busy && close(null)} />
        </div>
        {dialog.message && <p class="dialog-msg">{dialog.message}</p>}
        {dialog.kind === 'password' && (
          <div class="field">
            <PasswordInput value={pw} onInput={setPw} autoFocus placeholder={dialog.placeholder || 'Mot de passe'} onEnter={submit} />
            {error && <p class="form-error">{error}</p>}
          </div>
        )}
        <div class="dialog-actions">
          <button type="button" class="btn btn--ghost" onClick={() => close(null)} disabled={busy}>
            {dialog.cancelLabel || 'Annuler'}
          </button>
          <button
            type="button"
            class={`btn ${dialog.danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={submit}
            disabled={busy || (dialog.kind === 'password' && !pw)}
          >
            {busy ? 'Vérification…' : dialog.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div class={`toast ${toast.tone === 'error' ? 'toast--error' : ''}`} role="status" key={toast.id}>
      {toast.text}
    </div>
  );
}

/** Cadran de coffre-fort : tourne pendant le calcul de la clé, s'ouvre au déverrouillage. */
export function Dial({ state }) {
  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    ticks.push(
      <line
        key={i}
        x1="100"
        y1={major ? 14 : 18}
        x2="100"
        y2="26"
        class={major ? 'tick tick--major' : 'tick'}
        transform={`rotate(${i * 6} 100 100)`}
      />,
    );
  }
  return (
    <div class={`dial dial--${state}`} aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="96" class="dial-rim" />
        <g class="dial-face">
          <circle cx="100" cy="100" r="84" class="dial-plate" />
          {ticks}
          <circle cx="100" cy="100" r="46" class="dial-hub" />
          <rect x="94" y="62" width="12" height="76" rx="6" class="dial-handle" />
        </g>
        <path d="M100 2 l7 10 h-14 z" class="dial-mark" />
      </svg>
    </div>
  );
}

export function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function daysSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

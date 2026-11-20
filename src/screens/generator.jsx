// Générateur de mots de passe : écran autonome et panneau utilisé dans le formulaire.
import { useEffect, useState } from 'preact/hooks';
import { ArrowLeft, RefreshCw } from 'lucide-preact';
import { CopyButton, Header, IconButton, PasswordText, StrengthMeter, Toggle, useApp } from '../ui.jsx';
import { DEFAULT_GEN, generatePassword, generatorEntropy } from '../lib/generator.js';

const PREF_KEY = 'coffre.generator';

function loadOpts() {
  try {
    return { ...DEFAULT_GEN, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_GEN };
  }
}

function saveOpts(opts) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(opts));
  } catch {
    // préférences non enregistrées : sans importance
  }
}

export function GeneratorPanel({ onUse }) {
  const [opts, setOpts] = useState(loadOpts);
  const [value, setValue] = useState(() => generatePassword(loadOpts()));

  useEffect(() => {
    saveOpts(opts);
    setValue(generatePassword(opts));
  }, [opts]);

  const set = (key, v) => {
    const next = { ...opts, [key]: v };
    if (!next.lower && !next.upper && !next.digits && !next.symbols) return; // au moins une famille
    setOpts(next);
  };

  return (
    <div class="gen">
      <div class="gen-output">
        <div class="gen-value">
          <PasswordText value={value} reveal />
        </div>
        <div class="gen-actions">
          <IconButton icon={RefreshCw} label="Générer un autre" onClick={() => setValue(generatePassword(opts))} />
          <CopyButton text={value} label="Copier" what="Mot de passe" />
        </div>
      </div>
      <StrengthMeter bits={generatorEntropy(opts)} />

      <div class="gen-length">
        <label for="gen-len" class="label">
          Longueur <strong>{opts.length}</strong>
        </label>
        <input
          id="gen-len"
          type="range"
          min="8"
          max="64"
          value={opts.length}
          onInput={(e) => set('length', Number(e.currentTarget.value))}
        />
      </div>
      <div class="group">
        <Toggle label="Majuscules" hint="A à Z" checked={opts.upper} onChange={(v) => set('upper', v)} />
        <Toggle label="Minuscules" hint="a à z" checked={opts.lower} onChange={(v) => set('lower', v)} />
        <Toggle label="Chiffres" hint="0 à 9" checked={opts.digits} onChange={(v) => set('digits', v)} />
        <Toggle label="Symboles" hint="! # $ % & * @ …" checked={opts.symbols} onChange={(v) => set('symbols', v)} />
        <Toggle
          label="Éviter les caractères ambigus"
          hint="Pas de l, I, 1, O, 0 : plus facile à recopier"
          checked={opts.avoidAmbiguous}
          onChange={(v) => set('avoidAmbiguous', v)}
        />
      </div>
      {onUse && (
        <button type="button" class="btn btn--primary btn--block" onClick={() => onUse(value)}>
          Utiliser ce mot de passe
        </button>
      )}
    </div>
  );
}

export function GeneratorScreen() {
  const app = useApp();
  return (
    <main class="screen">
      <Header title="Générateur" left={<IconButton icon={ArrowLeft} label="Retour" onClick={app.pop} />} />
      <div class="content">
        <GeneratorPanel />
      </div>
    </main>
  );
}

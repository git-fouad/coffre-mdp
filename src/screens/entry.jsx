// Fiche d'un mot de passe (consultation) et formulaire d'ajout / modification.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ArrowLeft, Dices, ExternalLink, Eye, EyeOff, History, Pencil, Star, Trash2, X } from 'lucide-preact';
import {
  CopyButton,
  formatDate,
  Header,
  IconButton,
  Monogram,
  PasswordInput,
  PasswordText,
  StrengthMeter,
  useApp,
} from '../ui.jsx';
import { GeneratorPanel } from './generator.jsx';
import { DEFAULT_CATEGORIES, newEntry, updateEntry } from '../lib/vault.js';
import { titleFromUrl } from '../lib/csv.js';

export function safeUrl(url) {
  const u = (url || '').trim();
  if (!u) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function DetailScreen({ id }) {
  const app = useApp();
  const entry = app.data.entries.find((e) => e.id === id);
  const [reveal, setReveal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [revealOld, setRevealOld] = useState(-1);

  useEffect(() => {
    if (!entry) app.pop();
  }, [entry]);
  if (!entry) return null;

  const link = safeUrl(entry.url);
  const toggleFav = () =>
    app.saveEntries(app.data.entries.map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e)));
  const remove = async () => {
    const ok = await app.confirm({
      title: 'Supprimer ce mot de passe ?',
      message: `« ${entry.title} » sera définitivement supprimé du coffre.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    app.pop();
    await app.saveEntries(app.data.entries.filter((e) => e.id !== id));
    app.toast('Mot de passe supprimé.');
  };

  return (
    <main class="screen">
      <Header
        title=""
        left={<IconButton icon={ArrowLeft} label="Retour" onClick={app.pop} />}
        right={
          <>
            <IconButton
              icon={Star}
              label={entry.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              tone={entry.favorite ? 'fav' : undefined}
              onClick={toggleFav}
            />
            <IconButton icon={Pencil} label="Modifier" onClick={() => app.push({ name: 'edit', id })} />
          </>
        }
      />
      <div class="content">
        <div class="detail-head">
          <Monogram title={entry.title} size="lg" />
          <div>
            <h2 class="detail-title">{entry.title || 'Sans titre'}</h2>
            {entry.category && <span class="detail-cat">{entry.category}</span>}
          </div>
        </div>

        <div class="group">
          {entry.username && (
            <div class="field-row">
              <div class="field-main">
                <span class="field-label">Identifiant</span>
                <span class="field-value">{entry.username}</span>
              </div>
              <CopyButton text={entry.username} label="Copier l’identifiant" what="Identifiant" />
            </div>
          )}
          <div class="field-row">
            <div class="field-main">
              <span class="field-label">Mot de passe</span>
              <span class="field-value">
                <PasswordText value={entry.password} reveal={reveal} />
              </span>
            </div>
            <IconButton icon={reveal ? EyeOff : Eye} label={reveal ? 'Masquer' : 'Afficher'} onClick={() => setReveal(!reveal)} />
            {entry.password && <CopyButton text={entry.password} label="Copier le mot de passe" what="Mot de passe" />}
          </div>
          {entry.url && (
            <div class="field-row">
              <div class="field-main">
                <span class="field-label">Site web</span>
                <span class="field-value field-value--url">{entry.url}</span>
              </div>
              {link && (
                <a class="icon-btn" href={link} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le site" title="Ouvrir le site">
                  <ExternalLink size={22} aria-hidden="true" />
                </a>
              )}
              <CopyButton text={entry.url} label="Copier l’adresse" what="Adresse" />
            </div>
          )}
        </div>

        {entry.notes && (
          <div class="group">
            <div class="field-row">
              <div class="field-main">
                <span class="field-label">Notes</span>
                <p class="field-notes">{entry.notes}</p>
              </div>
            </div>
          </div>
        )}

        {entry.history.length > 0 && (
          <div class="group">
            <button type="button" class="row-btn" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
              <History size={18} aria-hidden="true" />
              <span>Anciens mots de passe ({entry.history.length})</span>
            </button>
            {showHistory &&
              entry.history.map((h, i) => (
                <div class="field-row" key={i}>
                  <div class="field-main">
                    <span class="field-label">Remplacé le {formatDate(h.changedAt)}</span>
                    <span class="field-value">
                      <PasswordText value={h.password} reveal={revealOld === i} />
                    </span>
                  </div>
                  <IconButton
                    icon={revealOld === i ? EyeOff : Eye}
                    label={revealOld === i ? 'Masquer' : 'Afficher'}
                    onClick={() => setRevealOld(revealOld === i ? -1 : i)}
                  />
                  <CopyButton text={h.password} label="Copier" what="Ancien mot de passe" />
                </div>
              ))}
          </div>
        )}

        <p class="meta">
          Créé le {formatDate(entry.createdAt)}
          {entry.updatedAt !== entry.createdAt && <>, modifié le {formatDate(entry.updatedAt)}</>}
        </p>

        <button type="button" class="btn btn--danger-ghost btn--block" onClick={remove}>
          <Trash2 size={18} aria-hidden="true" /> Supprimer
        </button>
      </div>
    </main>
  );
}

export function EditScreen({ id }) {
  const app = useApp();
  const existing = id ? app.data.entries.find((e) => e.id === id) : null;
  const initial = useMemo(
    () =>
      existing
        ? { ...existing }
        : { title: '', username: '', password: '', url: '', notes: '', category: '', favorite: false },
    [id],
  );
  const [form, setForm] = useState(initial);
  const [genOpen, setGenOpen] = useState(false);
  const [error, setError] = useState('');

  const fields = ['title', 'username', 'password', 'url', 'notes', 'category', 'favorite'];
  const dirty = fields.some((k) => form[k] !== initial[k]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const onText = (k) => (e) => set(k)(e.currentTarget.value);

  const categories = useMemo(() => {
    const used = app.data.entries.map((e) => e.category).filter(Boolean);
    return [...new Set([...used, ...DEFAULT_CATEGORIES])];
  }, [app.data.entries]);

  const leave = async () => {
    if (genOpen) {
      setGenOpen(false);
      return;
    }
    if (dirty) {
      const ok = await app.confirm({
        title: 'Abandonner les modifications ?',
        message: 'Ce que vous avez saisi ne sera pas enregistré.',
        confirmLabel: 'Abandonner',
        cancelLabel: 'Continuer la saisie',
        danger: true,
      });
      if (!ok) return;
    }
    app.pop();
  };

  useEffect(() => app.setBackHandler(leave), [dirty, genOpen]);
  useEffect(() => () => app.setBackHandler(null), []);

  const save = async () => {
    const clean = {
      ...form,
      title: form.title.trim() || titleFromUrl(form.url.trim()) || form.username.trim(),
      username: form.username.trim(),
      url: form.url.trim(),
      category: form.category.trim(),
    };
    if (!clean.title) {
      setError('Donnez un nom à ce compte (par exemple « Banque » ou « Gmail »).');
      return;
    }
    if (!clean.password && !clean.username) {
      setError('Renseignez au moins un identifiant ou un mot de passe.');
      return;
    }
    const changes = Object.fromEntries(fields.map((k) => [k, clean[k]]));
    let entries;
    if (existing) {
      entries = app.data.entries.map((e) => (e.id === id ? updateEntry(e, changes) : e));
    } else {
      entries = [...app.data.entries, newEntry(changes)];
    }
    app.setBackHandler(null);
    await app.saveEntries(entries);
    app.toast(existing ? 'Modifications enregistrées.' : 'Mot de passe ajouté.');
    if (existing) app.pop();
    else app.replace({ name: 'detail', id: entries[entries.length - 1].id });
  };

  return (
    <main class="screen">
      <Header
        title={existing ? 'Modifier' : 'Ajouter'}
        left={<IconButton icon={X} label="Annuler" onClick={leave} />}
        right={
          <button type="button" class="btn btn--small btn--primary" onClick={save}>
            Enregistrer
          </button>
        }
      />
      <div class="content form">
        <label class="label" for="f-title">
          Nom
        </label>
        <input id="f-title" class="input" value={form.title} onInput={onText('title')} placeholder="ex. : Banque, Gmail, Netflix" />

        <label class="label" for="f-user">
          Identifiant ou e-mail
        </label>
        <input
          id="f-user"
          class="input"
          value={form.username}
          onInput={onText('username')}
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
        />

        <label class="label" for="f-pw">
          Mot de passe
        </label>
        <div class="pw-line">
          <PasswordInput id="f-pw" value={form.password} onInput={set('password')} />
          <IconButton icon={Dices} label="Générer un mot de passe" onClick={() => setGenOpen(true)} class="icon-btn--boxed" />
        </div>
        <StrengthMeter password={form.password} />

        <label class="label" for="f-url">
          Site web
        </label>
        <input
          id="f-url"
          class="input"
          type="url"
          inputMode="url"
          value={form.url}
          onInput={onText('url')}
          placeholder="ex. : amazon.fr"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
        />

        <label class="label" for="f-cat">
          Catégorie
        </label>
        <input id="f-cat" class="input" value={form.category} onInput={onText('category')} placeholder="Facultatif" />
        <div class="chips chips--wrap">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              class={`chip ${form.category === c ? 'is-on' : ''}`}
              onClick={() => set('category')(form.category === c ? '' : c)}
            >
              {c}
            </button>
          ))}
        </div>

        <label class="label" for="f-notes">
          Notes
        </label>
        <textarea id="f-notes" class="input input--area" rows={4} value={form.notes} onInput={onText('notes')} placeholder="Questions secrètes, code PIN, numéro client…" />

        <label class="check">
          <input type="checkbox" checked={form.favorite} onChange={(e) => set('favorite')(e.currentTarget.checked)} />
          <span>Afficher dans les favoris</span>
        </label>

        {error && <p class="form-error">{error}</p>}
        <button type="button" class="btn btn--primary btn--block" onClick={save}>
          Enregistrer
        </button>
      </div>

      {genOpen && (
        <div class="scrim scrim--sheet" onClick={() => setGenOpen(false)}>
          <div class="sheet" role="dialog" aria-modal="true" aria-label="Générateur" onClick={(e) => e.stopPropagation()}>
            <div class="dialog-head">
              <h2>Générer un mot de passe</h2>
              <IconButton icon={X} label="Fermer" onClick={() => setGenOpen(false)} />
            </div>
            <GeneratorPanel
              onUse={(pw) => {
                set('password')(pw);
                setGenOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}

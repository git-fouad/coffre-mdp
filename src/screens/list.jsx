// Liste des mots de passe : recherche, catégories, copie rapide.
import { useMemo, useState } from 'preact/hooks';
import { Dices, FileUp, Lock, Plus, Search, Settings, Star, X } from 'lucide-preact';
import { CopyButton, daysSince, Header, IconButton, Monogram, useApp } from '../ui.jsx';

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function ListScreen() {
  const app = useApp();
  const { entries, settings } = app.data;
  const [query, setQuery] = useState(app.listState.query || '');
  const [filter, setFilter] = useState(app.listState.filter || 'all');

  const setQ = (q) => {
    setQuery(q);
    app.listState.query = q;
  };
  const setF = (f) => {
    setFilter(f);
    app.listState.filter = f;
  };

  const categories = useMemo(
    () => [...new Set(entries.map((e) => e.category).filter(Boolean))].sort(collator.compare),
    [entries],
  );
  const hasFavorites = entries.some((e) => e.favorite);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return entries
      .filter((e) => {
        if (filter === 'fav' && !e.favorite) return false;
        if (filter !== 'all' && filter !== 'fav' && e.category !== filter) return false;
        if (!q) return true;
        return [e.title, e.username, e.url, e.category].some((v) => normalize(v).includes(q));
      })
      .sort((a, b) => collator.compare(a.title, b.title));
  }, [entries, query, filter]);

  const backupAge = daysSince(settings.lastBackupAt);
  const needsBackup = entries.length > 0 && backupAge > 30;

  return (
    <main class="screen">
      <Header
        title="Coffre"
        sub={entries.length ? `${entries.length} mot${entries.length > 1 ? 's' : ''} de passe` : undefined}
        right={
          <>
            <IconButton icon={Dices} label="Générateur de mots de passe" onClick={() => app.push({ name: 'generator' })} />
            <IconButton icon={Lock} label="Verrouiller" onClick={() => app.lock(true)} />
            <IconButton icon={Settings} label="Réglages" onClick={() => app.push({ name: 'settings' })} />
          </>
        }
      />

      {entries.length > 0 && (
        <div class="list-tools">
          <label class="search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Rechercher"
              value={query}
              onInput={(e) => setQ(e.currentTarget.value)}
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              aria-label="Rechercher un mot de passe"
            />
            {query && <IconButton icon={X} label="Effacer la recherche" size={18} onClick={() => setQ('')} />}
          </label>
          {(categories.length > 0 || hasFavorites) && (
            <div class="chips" role="tablist" aria-label="Filtrer">
              <button type="button" class={`chip ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setF('all')}>
                Tous
              </button>
              {hasFavorites && (
                <button type="button" class={`chip ${filter === 'fav' ? 'is-on' : ''}`} onClick={() => setF('fav')}>
                  <Star size={14} aria-hidden="true" /> Favoris
                </button>
              )}
              {categories.map((c) => (
                <button key={c} type="button" class={`chip ${filter === c ? 'is-on' : ''}`} onClick={() => setF(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {needsBackup && (
        <div class="notice">
          <p>
            {backupAge === Infinity
              ? 'Vous n’avez encore fait aucune sauvegarde.'
              : `Dernière sauvegarde il y a ${backupAge} jours.`}{' '}
            Si ce téléphone est perdu ou cassé, vos mots de passe partent avec lui.
          </p>
          <button type="button" class="btn btn--small" onClick={app.exportBackup}>
            Sauvegarder maintenant
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <div class="empty">
          <p class="empty-title">Votre coffre est vide.</p>
          <p class="empty-text">Ajoutez vos comptes un par un, ou importez ceux enregistrés dans Chrome.</p>
          <button type="button" class="btn btn--primary" onClick={() => app.push({ name: 'edit' })}>
            <Plus size={18} aria-hidden="true" /> Ajouter un mot de passe
          </button>
          <button type="button" class="btn btn--ghost" onClick={() => app.push({ name: 'import-csv' })}>
            <FileUp size={18} aria-hidden="true" /> Importer depuis Chrome
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div class="empty">
          <p class="empty-text">Aucun résultat pour « {query || filter} ».</p>
        </div>
      ) : (
        <ul class="entries">
          {visible.map((e) => (
            <li key={e.id}>
              <div
                class="entry"
                role="button"
                tabIndex={0}
                onClick={() => app.push({ name: 'detail', id: e.id })}
                onKeyDown={(ev) => ev.key === 'Enter' && app.push({ name: 'detail', id: e.id })}
              >
                <Monogram title={e.title} />
                <span class="entry-text">
                  <span class="entry-title">
                    {e.title || 'Sans titre'}
                    {e.favorite && <Star size={13} class="entry-star" aria-label="Favori" />}
                  </span>
                  {e.username && <span class="entry-sub">{e.username}</span>}
                </span>
                {e.password && <CopyButton text={e.password} label="Copier le mot de passe" what="Mot de passe" />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <button type="button" class="fab" aria-label="Ajouter un mot de passe" onClick={() => app.push({ name: 'edit' })}>
          <Plus size={26} aria-hidden="true" />
        </button>
      )}
    </main>
  );
}

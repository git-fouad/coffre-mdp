// État global de l'appli : verrouillage, navigation, enregistrement du coffre.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { App as CapApp } from '@capacitor/app';
import { Ctx, Dialog, Toast } from './ui.jsx';
import { BiometricOffer, LockScreen, SetupScreen } from './screens/lock.jsx';
import { ListScreen } from './screens/list.jsx';
import { DetailScreen, EditScreen } from './screens/entry.jsx';
import { GeneratorScreen } from './screens/generator.jsx';
import { ChangePasswordScreen, ImportCsvScreen, SettingsScreen } from './screens/settings.jsx';
import { biometric, cleanShareCache, clearClipboard, copySecret, isCancel, isNative, pickFile, shareTextFile } from './lib/native.js';
import { deleteVault, loadVaultFile, saveVaultText } from './lib/storage.js';
import {
  mergeEntries,
  parseVaultFile,
  sealVault,
  serializeVault,
  unlockWithPassword,
  vaultKeyB64,
  WrongPasswordError,
  checkPassword,
} from './lib/vault.js';

const IDLE_LOCK_MS = 5 * 60 * 1000;
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export function App() {
  const [phase, setPhase] = useState('loading'); // loading | setup | locked | bio-offer | unlocked
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [stack, setStack] = useState([{ name: 'list' }]);
  const [toastMsg, setToastState] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [bio, setBio] = useState({ available: false, enabled: false, reason: '' });
  const [autoBio, setAutoBio] = useState(true);
  const [version, setVersion] = useState(APP_VERSION);

  const sessionRef = useRef(null);
  const saveChain = useRef(Promise.resolve());
  const suspendLock = useRef(false);
  const pausedAt = useRef(0);
  const backHandler = useRef(null);
  const listState = useRef({});
  const toastTimer = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { phase, stack, dialog };

  // ------------------------------------------------------------- utilitaires
  const toast = (text, tone = 'info', ms) => {
    clearTimeout(toastTimer.current);
    setToastState({ text, tone, id: Date.now() });
    toastTimer.current = setTimeout(() => setToastState(null), ms || (tone === 'error' ? 6000 : 3200));
  };
  const confirm = (opts) => new Promise((resolve) => setDialog({ kind: 'confirm', ...opts, resolve, id: Date.now() }));
  const askPassword = (opts) =>
    new Promise((resolve) => setDialog({ kind: 'password', ...opts, resolve, id: Date.now() }));
  const closeDialog = (value) => {
    const d = stateRef.current.dialog;
    setDialog(null);
    if (d) d.resolve(value);
  };

  /** Empêche le verrouillage automatique pendant une action qui quitte l'appli (sélecteur de fichier, partage). */
  const withoutAutoLock = async (fn) => {
    suspendLock.current = true;
    try {
      return await fn();
    } finally {
      setTimeout(() => {
        suspendLock.current = false;
      }, 1500);
    }
  };

  const refreshBio = async () => {
    try {
      setBio(await biometric.status());
    } catch {
      setBio({ available: false, enabled: false, reason: '' });
    }
  };

  // -------------------------------------------------------------- démarrage
  useEffect(() => {
    (async () => {
      await refreshBio();
      if (isNative) {
        try {
          const info = await CapApp.getInfo();
          setVersion(info.version);
        } catch {
          // version inconnue
        }
      }
      cleanShareCache();
      const f = await loadVaultFile();
      setFile(f);
      setPhase(f ? 'locked' : 'setup');
    })();
  }, []);

  // ------------------------------------------------------------ verrouillage
  const lock = (manual = false) => {
    sessionRef.current = null;
    clearTimeout(toastTimer.current);
    setToastState(null);
    setData(null);
    closeDialog(null);
    backHandler.current = null;
    setAutoBio(!manual);
    setStack([{ name: 'list' }]);
    setPhase((p) => (p === 'unlocked' || p === 'bio-offer' ? 'locked' : p));
  };

  const onUnlocked = (session, extra = {}) => {
    sessionRef.current = session;
    setData(session.data);
    setStack([{ name: 'list' }]);
    listState.current = {};
    if (extra.isNew && bio.available) setPhase('bio-offer');
    else setPhase('unlocked');
  };

  // Inactivité au premier plan
  useEffect(() => {
    if (phase !== 'unlocked' && phase !== 'bio-offer') return undefined;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => lock(false), IDLE_LOCK_MS);
    };
    reset();
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true, capture: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset, { capture: true }));
    };
  }, [phase]);

  // Passage en arrière-plan / retour
  useEffect(() => {
    const onPause = () => {
      pausedAt.current = Date.now();
      const s = sessionRef.current;
      if (s && !suspendLock.current && s.data.settings.autoLockSeconds === 0) lock(false);
    };
    const onResume = () => {
      const suspended = suspendLock.current;
      suspendLock.current = false;
      if (suspended) return;
      const s = sessionRef.current;
      if (s) {
        const delay = s.data.settings.autoLockSeconds * 1000;
        if (pausedAt.current && Date.now() - pausedAt.current >= delay) lock(false);
      } else if (stateRef.current.phase === 'locked') {
        setAutoBio(true);
        refreshBio();
      }
    };
    const handles = [];
    if (isNative) {
      handles.push(CapApp.addListener('pause', onPause), CapApp.addListener('resume', onResume));
    } else {
      const vis = () => (document.hidden ? onPause() : onResume());
      document.addEventListener('visibilitychange', vis);
      handles.push(Promise.resolve({ remove: () => document.removeEventListener('visibilitychange', vis) }));
    }
    return () => handles.forEach((h) => h.then((x) => x.remove()));
  }, []);

  // Bouton retour d'Android
  useEffect(() => {
    if (!isNative) return undefined;
    const h = CapApp.addListener('backButton', () => {
      const { stack: st, dialog: dlg, phase: ph } = stateRef.current;
      if (dlg) {
        closeDialog(null);
        return;
      }
      if (ph === 'unlocked' && backHandler.current) {
        backHandler.current();
        return;
      }
      if (ph === 'unlocked' && st.length > 1) {
        setStack(st.slice(0, -1));
        return;
      }
      CapApp.minimizeApp();
    });
    return () => h.then((x) => x.remove());
  }, []);

  // ----------------------------------------------------------- navigation
  const push = (route) => {
    backHandler.current = null;
    // En quittant la liste, on retient la position de défilement et la fiche ouverte.
    const top = stateRef.current.stack[stateRef.current.stack.length - 1];
    if (top && top.name === 'list') {
      listState.current.scrollY = window.scrollY;
      listState.current.lastId = route.id;
    }
    setStack((s) => [...s, route]);
  };
  const pop = () => {
    backHandler.current = null;
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };
  const replace = (route) => {
    backHandler.current = null;
    setStack((s) => [...s.slice(0, -1), route]);
  };

  // Retour sur la liste : même position qu'avant. Autres écrans : en haut de page.
  const topRoute = stack[stack.length - 1];
  const routeKey = `${phase}-${stack.length}-${topRoute.name}-${topRoute.id || ''}`;
  useLayoutEffect(() => {
    if (phase !== 'unlocked') return;
    if (topRoute.name !== 'list') {
      window.scrollTo(0, 0);
      return;
    }
    const { scrollY = 0, lastId } = listState.current;
    window.scrollTo(0, scrollY);
    // Si la liste a changé entre-temps, on s'assure que la fiche consultée reste visible.
    const el = lastId && document.querySelector(`[data-entry-id="${CSS.escape(lastId)}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 140 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: 'center' });
    }
  }, [routeKey]);

  // --------------------------------------------------------- enregistrement
  const persist = (session) => {
    const run = saveChain.current.then(async () => {
      const f = await sealVault(session);
      await saveVaultText(serializeVault(f));
      setFile(f);
    });
    saveChain.current = run.catch(() => {});
    return run.catch((err) => {
      toast(`Échec de l’enregistrement : ${err.message}`, 'error');
      throw err;
    });
  };

  const commitData = (nextData) => {
    const s = sessionRef.current;
    if (!s) return Promise.resolve();
    s.data = nextData;
    setData(nextData);
    return persist(s);
  };

  const saveEntries = (entries) => commitData({ ...sessionRef.current.data, entries });
  const saveSettings = (changes) =>
    commitData({ ...sessionRef.current.data, settings: { ...sessionRef.current.data.settings, ...changes } });

  const replaceSession = async (next) => {
    sessionRef.current = next;
    setData(next.data);
    await persist(next);
  };

  // ------------------------------------------------------------ actions
  const copy = async (text, what = 'Texte') => {
    const secs = sessionRef.current ? sessionRef.current.data.settings.clipboardClearSeconds : 30;
    try {
      await copySecret(text, secs);
      toast(secs > 0 ? `${what} copié. Effacement dans ${secs} s.` : `${what} copié.`);
      return true;
    } catch (err) {
      toast(`Copie impossible : ${err.message}`, 'error');
      return false;
    }
  };

  const enableBiometric = async () => {
    const s = sessionRef.current;
    if (!s) return false;
    try {
      await withoutAutoLock(() => biometric.enable(vaultKeyB64(s)));
      await refreshBio();
      toast('Empreinte activée.');
      return true;
    } catch (err) {
      await refreshBio();
      if (!isCancel(err)) toast(err.message || 'Activation impossible.', 'error');
      return false;
    }
  };

  const disableBiometric = async () => {
    await biometric.disable();
    await refreshBio();
    toast('Empreinte désactivée.');
  };

  const exportBackup = async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const text = serializeVault(await sealVault(s));
      const shared = await withoutAutoLock(() =>
        shareTextFile(`coffre-sauvegarde-${today}.json`, text, 'Sauvegarde Coffre'),
      );
      if (!shared) return;
      await saveSettings({ lastBackupAt: new Date().toISOString() });
      toast('Sauvegarde exportée. Elle s’ouvre avec votre mot de passe maître actuel.', 'info', 5000);
    } catch (err) {
      toast(`Export impossible : ${err.message}`, 'error');
    }
  };

  const importBackup = async () => {
    const picked = await withoutAutoLock(() => pickFile());
    if (!picked) return;
    let parsed;
    try {
      parsed = parseVaultFile(await picked.text());
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    let imported = null;
    const ok = await askPassword({
      title: 'Importer la sauvegarde',
      message: 'Saisissez le mot de passe maître utilisé au moment de cette sauvegarde.',
      confirmLabel: 'Importer',
      onSubmit: async (pw) => {
        try {
          imported = await unlockWithPassword(parsed, pw);
          return null;
        } catch (err) {
          return err instanceof WrongPasswordError ? 'Mot de passe incorrect.' : err.message;
        }
      },
    });
    if (!ok || !imported || !sessionRef.current) return;
    const r = mergeEntries(sessionRef.current.data.entries, imported.data.entries);
    await saveEntries(r.entries);
    const parts = [`${r.added} ajouté${r.added > 1 ? 's' : ''}`];
    if (r.updated) parts.push(`${r.updated} mis à jour`);
    if (r.skipped) parts.push(`${r.skipped} déjà présent${r.skipped > 1 ? 's' : ''}`);
    toast(`Sauvegarde importée : ${parts.join(', ')}.`, 'info', 5000);
  };

  const resetVault = async () => {
    const s = sessionRef.current;
    if (!s) return;
    const ok = await askPassword({
      title: 'Effacer le coffre ?',
      message:
        'Tous les mots de passe seront supprimés de ce téléphone. Seule une sauvegarde exportée permettra de les retrouver. Saisissez votre mot de passe maître pour confirmer.',
      confirmLabel: 'Tout effacer',
      danger: true,
      onSubmit: async (pw) => ((await checkPassword(s, pw)) ? null : 'Mot de passe incorrect.'),
    });
    if (!ok) return;
    await saveChain.current;
    await deleteVault();
    await biometric.disable().catch(() => {});
    await clearClipboard().catch(() => {});
    sessionRef.current = null;
    setData(null);
    setFile(null);
    await refreshBio();
    setStack([{ name: 'list' }]);
    setPhase('setup');
  };

  // Premier lancement : création ou restauration
  const onSetupReady = async (session, info = {}) => {
    await persist(session);
    if (info.restored !== undefined) {
      toast(`Sauvegarde restaurée : ${info.restored} mot${info.restored > 1 ? 's' : ''} de passe.`, 'info', 5000);
    }
    onUnlocked(session, { isNew: true });
  };

  const onBioInvalid = async () => {
    await biometric.disable().catch(() => {});
    await refreshBio();
  };

  const ctx = {
    data,
    bio,
    version,
    listState: listState.current,
    session: () => sessionRef.current,
    toast,
    confirm,
    askPassword,
    withoutAutoLock,
    push,
    pop,
    replace,
    lock,
    copy,
    saveEntries,
    saveSettings,
    replaceSession,
    enableBiometric,
    disableBiometric,
    exportBackup,
    importBackup,
    resetVault,
    setBackHandler: (fn) => {
      backHandler.current = fn;
    },
  };

  let screen = null;
  if (phase === 'setup') screen = <SetupScreen onReady={onSetupReady} />;
  else if (phase === 'locked' && file)
    screen = <LockScreen file={file} bio={bio} autoPrompt={autoBio} onUnlocked={onUnlocked} onBioInvalid={onBioInvalid} />;
  else if (phase === 'bio-offer') screen = <BiometricOffer onDone={() => setPhase('unlocked')} />;
  else if (phase === 'unlocked' && data) {
    const route = stack[stack.length - 1];
    const key = `${stack.length}-${route.name}-${route.id || ''}`;
    switch (route.name) {
      case 'detail':
        screen = <DetailScreen key={key} id={route.id} />;
        break;
      case 'edit':
        screen = <EditScreen key={key} id={route.id} />;
        break;
      case 'generator':
        screen = <GeneratorScreen key={key} />;
        break;
      case 'settings':
        screen = <SettingsScreen key={key} />;
        break;
      case 'change-password':
        screen = <ChangePasswordScreen key={key} />;
        break;
      case 'import-csv':
        screen = <ImportCsvScreen key={key} />;
        break;
      default:
        screen = <ListScreen key="list" />;
    }
  } else screen = <main class="screen screen--vault" aria-busy="true" />;

  return (
    <Ctx.Provider value={ctx}>
      {screen}
      <Dialog key={dialog ? dialog.id : 'none'} dialog={dialog} close={closeDialog} />
      <Toast toast={toastMsg} />
    </Ctx.Provider>
  );
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changeMasterPassword,
  checkPassword,
  createVault,
  mergeEntries,
  newEntry,
  parseVaultFile,
  sealVault,
  serializeVault,
  unlockWithKey,
  unlockWithPassword,
  updateEntry,
  vaultKeyB64,
  WrongPasswordError,
  InvalidFileError,
} from '../src/lib/vault.js';
import { entriesFromCsv, parseCsv, titleFromUrl } from '../src/lib/csv.js';
import { estimateEntropy, generatePassword, strengthLabel } from '../src/lib/generator.js';

test('création, scellement et déverrouillage du coffre', async () => {
  const t0 = Date.now();
  const s = await createVault('correct horse battery staple');
  const t1 = Date.now();
  s.data.entries.push(newEntry({ title: 'GitHub', username: 'git-fouad', password: 'p@ss "é" ✓' }));
  const text = serializeVault(await sealVault(s));
  assert.ok(!text.includes('git-fouad'), 'les données ne doivent pas apparaître en clair');
  const file = parseVaultFile(text);
  const s2 = await unlockWithPassword(file, 'correct horse battery staple');
  assert.equal(s2.data.entries[0].password, 'p@ss "é" ✓');
  assert.equal(s2.data.settings.autoLockSeconds, 60);
  await assert.rejects(unlockWithPassword(file, 'mauvais'), WrongPasswordError);
  // déverrouillage par clé (empreinte digitale)
  const s3 = await unlockWithKey(file, vaultKeyB64(s2));
  assert.equal(s3.data.entries[0].title, 'GitHub');
  console.log(`  argon2id : ${t1 - t0} ms`);
});

test('changement du mot de passe maître', async () => {
  const s = await createVault('ancien mot de passe');
  s.data.entries.push(newEntry({ title: 'A', password: 'x' }));
  const s2 = await changeMasterPassword(s, 'nouveau mot de passe');
  assert.ok(await checkPassword(s2, 'nouveau mot de passe'));
  assert.ok(!(await checkPassword(s2, 'ancien mot de passe')));
  const file = parseVaultFile(serializeVault(await sealVault(s2)));
  await assert.rejects(unlockWithPassword(file, 'ancien mot de passe'), WrongPasswordError);
  const s3 = await unlockWithPassword(file, 'nouveau mot de passe');
  assert.equal(s3.data.entries.length, 1);
  // la clé du coffre ne change pas : l'empreinte reste valable
  assert.equal(vaultKeyB64(s3), vaultKeyB64(s));
});

test('fichiers invalides', () => {
  assert.throws(() => parseVaultFile('pas du json'), InvalidFileError);
  assert.throws(() => parseVaultFile('{"format":"autre"}'), InvalidFileError);
  assert.throws(
    () => parseVaultFile(JSON.stringify({ format: 'coffre-mdp', version: 99, kdf: {}, wrappedKey: {}, data: {} })),
    /plus récente/,
  );
});

test('historique des mots de passe', () => {
  const e = newEntry({ title: 'X', password: 'un' });
  const e2 = updateEntry(e, { password: 'deux' });
  const e3 = updateEntry(e2, { password: 'trois', title: 'Y' });
  assert.deepEqual(
    e3.history.map((h) => h.password),
    ['deux', 'un'],
  );
  const e4 = updateEntry(e3, { notes: 'rien' });
  assert.equal(e4.history.length, 2);
});

test('fusion des entrées', () => {
  const a = newEntry({ title: 'A', password: '1' });
  const b = newEntry({ title: 'B', password: '2' });
  const newerA = { ...a, password: '1bis', updatedAt: new Date(Date.now() + 1000).toISOString() };
  const dupB = newEntry({ title: 'b', password: '2' });
  const c = newEntry({ title: 'C', password: '3' });
  const r = mergeEntries([a, b], [newerA, dupB, c]);
  assert.equal(r.added, 1);
  assert.equal(r.updated, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.entries.find((e) => e.id === a.id).password, '1bis');
});

test('CSV Chrome / Google', () => {
  const csv =
    '﻿name,url,username,password,note\r\n' +
    'github.com,https://github.com/login,git-fouad,"a,b""c",\r\n' +
    ',https://www.amazon.fr/ap/signin,moi@exemple.fr,secret,"ligne 1\nligne 2"\r\n' +
    'Banque,android://AbCd==@fr.creditagricole.androidapp/,123456,0000,\r\n' +
    ',,,,\r\n';
  const { entries, ignored } = entriesFromCsv(csv);
  assert.equal(entries.length, 3);
  assert.equal(ignored, 0);
  assert.equal(entries[0].title, 'github.com');
  assert.equal(entries[0].password, 'a,b"c');
  assert.equal(entries[1].title, 'amazon.fr');
  assert.equal(entries[1].notes, 'ligne 1\nligne 2');
  assert.equal(entries[2].title, 'Banque');
  assert.equal(entries[2].url, '');
});

test('CSV Bitwarden et Firefox', () => {
  const bw =
    'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
    'Travail,1,login,Intranet,,,0,https://intra.local,fouad,pw1,\n';
  const r1 = entriesFromCsv(bw);
  assert.equal(r1.entries[0].title, 'Intranet');
  assert.equal(r1.entries[0].category, 'Travail');
  const ff =
    '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"\n' +
    '"https://login.live.com","a@b.c","pw2",,"https://login.live.com","{x}","1","2","3"\n';
  const r2 = entriesFromCsv(ff);
  assert.equal(r2.entries[0].title, 'live.com');
  assert.equal(r2.entries[0].password, 'pw2');
  assert.throws(() => entriesFromCsv('a,b,c\n1,2,3'), /password/);
  assert.equal(parseCsv('a;b\n1;2')[1][1], '2');
  assert.equal(titleFromUrl('www.leboncoin.fr'), 'leboncoin.fr');
});

test('générateur', () => {
  for (let i = 0; i < 200; i++) {
    const pw = generatePassword({ length: 16, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: true });
    assert.equal(pw.length, 16);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[0-9]/);
    assert.match(pw, /[^a-zA-Z0-9]/);
    assert.doesNotMatch(pw, /[Il1O0o]/);
  }
  assert.equal(generatePassword({ length: 8, digits: true }).length, 8);
  assert.match(generatePassword({ length: 12, digits: true }), /^[0-9]{12}$/);
  assert.equal(strengthLabel(estimateEntropy('aaaaaaaaaaaa')).label, 'Faible');
  assert.equal(strengthLabel(estimateEntropy('Tr0mb0ne-Cerise-Lundi-42!')).label, 'Excellent');
});

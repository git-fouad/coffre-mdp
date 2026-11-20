# Coffre

Gestionnaire de mots de passe personnel pour Android. Les mots de passe restent sur le téléphone, chiffrés. L'appli n'a pas accès à Internet.

## Installer sur le téléphone

1. Sur le téléphone, ouvrez ce lien dans Chrome :
   **https://github.com/git-fouad/coffre-mdp/releases/latest/download/coffre.apk**
2. Ouvrez le fichier téléchargé. La première fois, Android demande d'autoriser Chrome à installer des applis : acceptez, puis revenez en arrière et touchez **Installer**.
3. Play Protect peut afficher un avertissement (appli inconnue, non publiée sur le Play Store) : touchez **Plus de détails → Installer quand même**.

Pour mettre à jour, refaites la même chose : la nouvelle version s'installe par-dessus et vos mots de passe sont conservés.

## Fonctionnalités

- Mot de passe maître et déverrouillage par empreinte digitale
- Recherche, catégories, favoris, historique des anciens mots de passe
- Générateur de mots de passe (longueur, familles de caractères, caractères ambigus)
- Copie avec effacement automatique du presse-papier (masquée dans l'aperçu d'Android 13 et plus)
- Verrouillage automatique (délai réglable) et après 5 minutes sans activité
- Captures d'écran bloquées, contenu masqué dans les applis récentes
- Import depuis Chrome / Google (CSV), et aussi Firefox, Bitwarden, Edge, Samsung Pass
- Export / import d'une sauvegarde chiffrée, restauration sur un nouveau téléphone

## Sauvegardes : à lire

Si le téléphone est perdu, cassé ou réinitialisé, les mots de passe partent avec lui. Exportez régulièrement une sauvegarde (Réglages → Exporter une sauvegarde) et gardez-la sur Google Drive, par e-mail ou sur un ordinateur. Le fichier est chiffré : il ne s'ouvre qu'avec le mot de passe maître utilisé au moment de l'export.

Le coffre chiffré est aussi inclus dans la sauvegarde automatique Google du téléphone, si elle est activée.

**Si vous oubliez le mot de passe maître, personne ne peut récupérer les données.**

## Sécurité

| Élément | Choix |
| --- | --- |
| Dérivation de la clé | Argon2id, 64 Mio, 3 passes, sel aléatoire de 128 bits |
| Chiffrement | AES-256-GCM (Web Crypto) |
| Schéma | Le mot de passe maître déchiffre une clé de coffre aléatoire de 256 bits, qui chiffre les données. Changer le mot de passe maître ne rechiffre que cette clé. |
| Empreinte | La clé du coffre est chiffrée par une clé AES du Keystore Android, utilisable uniquement après authentification biométrique forte, et détruite si les empreintes du téléphone changent. |
| Stockage | Dossier privé de l'appli, avec une copie de la version précédente en cas d'écriture interrompue |
| Réseau | Aucune permission Internet, et une politique de sécurité du contenu qui interdit toute connexion |

Le code est public, la clé de signature et les mots de passe ne le sont pas.

## Développement

Prérequis : Node.js 22.

```bash
npm install
npm test           # tests du chiffrement, de l'import CSV et du générateur
npm run dev        # version navigateur ; ajoutez ?fakebio à l'adresse pour simuler l'empreinte
npm run build && npx cap sync android
```

Chaque `git push` sur `main` lance GitHub Actions (`.github/workflows/build-apk.yml`), qui compile l'APK, le signe avec la clé stockée dans les secrets du dépôt (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`) et le publie dans les Releases.

Pour compiler en local : ouvrez le dossier `android/` dans Android Studio, ou lancez `cd android && ./gradlew assembleDebug`.

### Structure

```
src/lib/crypto.js       Argon2id, AES-GCM, aléa
src/lib/vault.js        format du coffre, déverrouillage, fusion
src/lib/csv.js          import CSV (Chrome, Firefox, Bitwarden…)
src/lib/generator.js    générateur et estimation de robustesse
src/lib/storage.js      lecture / écriture du fichier chiffré
src/lib/native.js       pont vers le plugin natif, partage de fichiers
src/screens/            écrans de l'interface (Preact)
android/app/src/main/java/com/gitfouad/coffre/CoffreNativePlugin.java
                        empreinte (Keystore + BiometricPrompt), presse-papier sensible
tools/make_icons.py     génération de l'icône
```

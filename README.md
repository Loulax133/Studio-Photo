# Light Studio

Simulateur de lumière studio : dossiers → sets → scène 3D avec mannequin, lumières, modeleurs, réflecteurs, appareil photo et rendu en direct.

## Mettre en ligne (GitHub Pages)
1. Crée un dépôt GitHub `light-studio` et envoie-y **tout le contenu de ce dossier** (index.html à la racine).
2. Dépôt → Settings → Pages → Source : `Deploy from a branch`, branche `main`, dossier `/ (root)`.
3. L'app sera sur `https://<ton-pseudo>.github.io/light-studio/`.

## Brancher Firebase (connexion + synchro ordi/téléphone)
1. Console Firebase → **Ajouter un projet** → `light-studio` (Analytics inutile).
2. ⚙️ Paramètres du projet → **Vos applications** → icône Web `</>` → nom `Light Studio` (pas besoin de Firebase Hosting). Copie le bloc `firebaseConfig`.
3. Colle-le dans `js/firebase-config.js` à la place de `null`.
4. **Authentication** → Commencer → Méthodes de connexion : active **Google** et **Adresse e-mail/Mot de passe**.
5. Authentication → Paramètres → **Domaines autorisés** → ajoute `<ton-pseudo>.github.io`.
6. **Firestore Database** → Créer une base → mode production → région `europe-west9 (Paris)`.
7. Firestore → onglet **Règles** → colle le contenu de `firestore.rules` → Publier. (À refaire à chaque fois que ce fichier change : la V1.4 ajoute les règles du partage.)

La connexion est mémorisée (persistance locale Firebase) : tu restes connecté jusqu'à ce que tu te déconnectes.

## Sur iPhone
Ouvre l'URL dans Safari → Partager → **Sur l'écran d'accueil**. Si la connexion Google bloque dans l'app installée, utilise la connexion email/mot de passe (même compte, mêmes sets).

## Structure
- `js/store.js` — connexion + sauvegarde (Firebase, ou local si pas configuré)
- `js/home.js` — accueil dossiers / sets
- `js/editor/` — éditeur 3D : `studio.js` (scène, photométrie), `mannequin.js`, `defaults.js` (catalogue), `editor.js` (interface)
- `vendor/three/` — Three.js r187 embarqué (aucune dépendance externe à part les polices et Firebase)

## Nouveautés V1.4
- Rendu « boîtier » : courbe calée sur un appareil (blanc pur ≈ +2,8 IL au-dessus du gris moyen) → cellule, image et histogramme cohérents.
- Ombres douces calculées en plusieurs points de la source (qualité « précise » sur ordinateur, « rapide » sur téléphone) + rebond du papier sur le sujet.
- Rotation / inclinaison libres des lumières (feathering). Perche automatique pour les lumières placées devant le sujet.
- Schémas en un clic (Rembrandt, loop, papillon, clamshell, split, contre-jour, high key, low key) avec exposition équilibrée, + schémas perso.
- Gélatines (CTO, CTB, couleurs), gobos (fenêtre, stores, feuillage, points), lumière de fenêtre, fumée/brume avec faisceaux.
- Profondeur de champ simulée (mise au point sur le point bleu), grille des tiers, comparaison avant / après.
- Lien de partage en lecture seule (nécessite les nouvelles règles Firestore).

## Nouveautés V1.5
- Téléphone : vue fiche par défaut (rendu calculé sur l'ordi à chaque sauvegarde, schéma, réglages), bouton 3D pour ajuster ponctuellement.
- « Recréer depuis une photo » (section Schémas) : analyse du portrait dans le navigateur (MediaPipe Face Landmarker, fichiers dans `vendor/mediapipe`, ~18 Mo chargés seulement à la première analyse).
- Fichier de set `.lightset` : export depuis l'éditeur (Exporter → Fichier du set), import depuis l'accueil (+ Nouveau → Importer un fichier de set).

## Crédits
- Coiffures des bustes réalistes `hair_witchy`, `hair_keylth`, `hair_sidedo`, `hair_babe80`, `hair_cornrows`, `hair_maxwell`, `hair_grump` : adaptées du pack « Hair 02 » de MakeHuman, par **Elvaerwyn**, licence CC-BY 4.0 (https://static.makehumancommunity.org/assets/assetpacks/hair02.html). Textures passées en niveaux de gris et coiffures recalées sur les bustes.
- Maillage de base et cibles : MakeHuman / MPFB2 (CC0).

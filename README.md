# 🐐 Dagoat TB-303 - Computer Controlled Bass Line

Une réplique virtuelle ultra-fidèle, autonome et interactive du légendaire synthétiseur de basse **Roland TB-303**, fonctionnant directement dans le navigateur en pur **Web Audio API** (sans aucun framework lourd, zéro dépendance externe).

![Dagoat TB-303](https://img.shields.io/badge/Web%20Audio%20API-100%25%20Pure%20DSP-ff3b30?style=for-the-badge)
![Status](https://img.shields.io/badge/Deployment-Ready%20for%20Netlify-success?style=for-the-badge)

---

## 🎛️ Fonctionnalités Sonores (Moteur DSP 303)

- **Double Forme d'Onde Analogique :**
  - **Sawtooth (Dent de scie) :** Agressive, riche en harmoniques impaires et paires.
  - **303 Square (Onde carrée asymétrique) :** Générée par séries de Fourier pour émuler la déformation et le tilt RC du circuit original (timbre creux et boisé caractéristique).
- **Filtre Échelle à Diodes Résonant (18–24 dB/octave) :**
  - Résonance à double cascade avec auto-oscillation et perte naturelle des basses aux valeurs élevées.
  - Balayage dynamique via **Cutoff Frequency** et **Env Mod**.
- **Comportement Réel du Slide (Portamento) :**
  - Glissé de fréquence sur ~60 ms **sans réenclencher les enveloppes de filtre et de volume** (le secret de l'Acid House).
- **Circuit d'Accent Authentique :**
  - Raccourcissement percutant du Decay (~120 ms).
  - Ouverture instantanée du filtre avec boost de volume et pic de résonance (*squelch*).
- **Stompbox Analogique Intégrée :**
  - Circuit d'Overdrive / Saturation douce (`tanh`).
  - Acid Delay synchronisé au tempo.
  - Réglage du Swing / Groove.

---

## 🎹 Séquenceur & Mémoire

- **Horloge Lookahead Haute Précision :** Zéro dérive temporelle, synchronisée sur l'horloge matérielle `AudioContext.currentTime`.
- **Chaînage de Patterns (Pattern Chaining) :**
  - Jouez 16, 32, 64 ou 128 pas en boucle en chaînant plusieurs patterns (via <kbd>Shift</kbd> + Clic ou le bouton <kbd>CHAIN</kbd>).
  - Le glissé (*Slide*) opère même à la jonction entre deux patterns.
- **32 Emplacements Mémoire :**
  - 4 Groupes (I, II, III, IV) x 8 Patterns avec sauvegarde automatique dans le `localStorage`.
- **8 Riffs de Légende Préchargés (Groupe I) :**
  1. *Phuture – Acid Trax*
  2. *Daft Punk – Da Funk*
  3. *Josh Wink – Higher State of Consciousness*
  4. *Resonance Madness*
  5. *Hardfloor 303 Rolling*
  6. *Jaydee – Plastic Dreams*
  7. *Square Acid Bouncer*
  8. *Submarine Acid Groove*
- **Générateur Algorithmique ⚡ Random Acid :** Crée à la volée des lignes de basse hypnotiques basées sur les gammes pentatoniques et doriennes.
- **Pattern Inspector :** Matrice visuelle déroulante affichant les 16 pas (Notes, Octaves, Accents, Slides) éditables d'un simple clic.

---

## 🕹️ Ergonomie & Finition Visuelle

- Châssis biseauté gris métallisé avec vis cruciformes, texture d'époque et diodes LED lumineuses avec halo (*bloom*).
- **Potentiomètres Rotatifs Vectoriels :** Manipulation fluide au glissé vertical, molette de souris, ou tactile.
- **Infobulles HUD Dynamiques :** Affichage de la valeur en temps réel uniquement lors du contact (ex: `1.25 kHz`, `75% (Q 7.5)`, `+5 ST`, `350 ms`, `125 BPM`).
- **Support Web MIDI Plug & Play :** Branchez n'importe quel clavier maître USB ou contrôleur matériel (Cutoff sur CC 74, Résonance sur CC 71).
- **Enregistreur Audio Intégré :** Enregistrez vos boucles et téléchargez-les instantanément au format audio prêt pour votre DAW.

---

## 🚀 Déploiement Direct (Netlify / Cloudflare Pages / Vercel)

Ce projet est 100% statique (HTML / CSS / JS Vanilla). Aucun `npm build` ni installation requise.

### Déploiement en 1 clic sur Netlify :
1. Connectez votre compte Netlify à ce dépôt GitHub : `muk365/dagoat-TB-303`.
2. Laissez les champs de build vides (Publish directory : racine `/`).
3. Déployez ! Votre 303 sera en ligne avec HTTPS automatique.

---

## 📜 Licence & Crédits

Inspiré par le design emblématique conçu par Tadao Kikumoto pour Roland Corporation en 1981.  
Réalisé avec passion pour la culture Acid House.

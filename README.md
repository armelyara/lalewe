# Lalewe

Livraison à la demande pour les commerçants d'Abidjan. PWA en HTML, CSS et JavaScript natif, en français et en anglais. Produit par The Day Info.

## Lancer en local

```
python3 -m http.server 8080      # puis ouvrir http://localhost:8080
node tests/logic.test.mjs        # tests de la logique métier
```

Mode démo (par défaut) : code SMS `0000`, données gardées dans le navigateur. Pour jouer le parcours complet, ouvrez deux onglets :

1. Onglet 1, commerçant : remplir la commande, se connecter, lancer.
2. Onglet 2, livreur : « Devenir livreur » (le numéro saisi sert de connexion), recharger le portefeuille, passer disponible, accepter, récupérer, saisir le code affiché chez le commerçant.

## Publier sur GitHub Pages

Poussez le contenu de ce dossier sur la branche `main`, puis Settings → Pages → Deploy from a branch → `main` / root.
Incrémentez `VERSION` dans `sw.js` à chaque mise en ligne.

## Réglages

`js/config.js` : taux de commission, nombre maximal d'arrêts, langue par défaut, mode de données.
`js/domain/pricing.js` : grille tarifaire et véhicules disponibles.
`css/tokens.css` : couleurs.

## Composants tiers embarqués

- Leaflet (BSD-2-Clause) : `vendor/leaflet/`
- Police Figtree (OFL) et sous-ensemble d'icônes Material Symbols (Apache-2.0) : `vendor/fonts/`
- Images de véhicules : Microsoft Fluent Emoji 3D (MIT)
- Fond de carte, recherche d'adresses (Photon) et itinéraire (OSRM) : © contributeurs OpenStreetMap, services publics réservés à un usage de démonstration

Architecture, schéma de données et limites connues : `docs/ARCHITECTURE.md`.

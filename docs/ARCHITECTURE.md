# Lalewe — Architecture (version 2)

Livraison à la demande pour les commerçants d'Abidjan. Produit par The Day Info.
PWA en HTML, CSS et JavaScript natif, sans framework ni étape de build. Interface en français et en anglais.

## 1. Qui fait quoi

| Acteur | Ce qu'il fait dans l'app |
|---|---|
| Commerçant | Commande une livraison dès l'accueil, suit ses commandes, donne le code de livraison à son client |
| Livreur | S'inscrit avec son véhicule, recharge son portefeuille, accepte des courses, livre |
| Client final | N'utilise pas l'app. Il reçoit le colis, paie le livreur et lui donne le code |

## 2. Modèle économique (provisoire, à confirmer)

- **Le client paie la course au livreur, en espèces, à la livraison.**
- **Commission** : 15 % du prix de la course (`commissionRate` dans `js/config.js`), déduite du portefeuille du livreur au moment où il accepte. Sans solde suffisant, il ne peut pas accepter. Si le commerçant annule avant la récupération, la commission est rendue.
- **Prix de la marchandise (optionnel)** : le livreur le paie au commerçant à la récupération, puis l'encaisse auprès du client avec la course.
- **Prix de la course** (moto) : 500 FCFA + 150 FCFA/km, minimum 1 000 FCFA, + 300 FCFA par arrêt supplémentaire, + 1 000 FCFA en urgent. Arrondi aux 100 FCFA.

## 3. Périmètre

| Inclus | Affiché « Bientôt » | Pas encore fait |
|---|---|---|
| Commande sans compte jusqu'au lancement | Tricycle, fourgonnette, camion (à la commande) | Paiement Mobile Money réel (CinetPay) |
| Jusqu'à 6 points : récupération, arrêts, livraison | | Envoi des photos de permis et carte grise |
| Carte OpenStreetMap, point placé au toucher | | Suivi GPS du livreur en direct |
| Prix calculé avant de lancer | | SMS au client, notifications |
| Connexion par téléphone (code SMS) | | Commande programmée, livreurs favoris |
| Activité : en cours et terminées | | Back-office de validation des livreurs |
| Portefeuille livreur : recharge simulée, commission, historique | | |
| Inscription livreur par type de véhicule | | |
| Preuve de livraison par code à 4 chiffres | | |
| Français et anglais | | |

## 4. Architecture système

```
PWA statique (GitHub Pages ou autre)
  index.html + sw.js (app shell hors ligne)
  views/ ──► data/index.js (contrat unique) ──► data/mock.js      démo, dans le navigateur
     │                                      └─► data/firebase.js  production (incomplet, voir §8)
     ├────► domain/ (prix, statuts, validation, communes) : pur, testé sous Node
     ├────► i18n.js (fr, en)
     └────► map.js ──► Leaflet (embarqué) ──► tuiles OpenStreetMap (réseau)
```

- **Deux adaptateurs de données derrière le même contrat.** `mock` rend la démo utilisable sans serveur ; le passage à Firebase se fait dans `js/config.js`.
- **Routage par hash**, compatible avec tout hébergement statique.
- **Tout est embarqué** (Leaflet, police Figtree, icônes, images) : seules les tuiles de carte viennent du réseau. Sans connexion, l'app s'ouvre et la carte reste grise.
- **Erreurs = clés de traduction** (`err.balance`…), traduites à l'affichage.

## 5. Structure des fichiers

```
lalewe/
├── index.html, manifest.webmanifest, sw.js
├── css/tokens.css            Couleurs et polices du design validé
├── css/app.css               Composants, mobile d'abord, bascule ordinateur à 900 px
├── js/app.js                 Démarrage, routes, garde d'accès, navigation
├── js/config.js              Mode de données, commission, langue par défaut, clés Firebase
├── js/i18n.js                Textes fr et en
├── js/map.js                 Carte : points, trajet, véhicule animé
├── js/router.js, js/ui.js
├── js/domain/                geo.js, pricing.js, orders.js
├── js/data/                  index.js, mock.js, firebase.js
├── js/views/                 home, courier, activity, order-detail, wallet, driver, login, account, shared
├── img/                      Images des véhicules et du colis
├── vendor/                   leaflet/, fonts/ (avec leurs licences)
├── firebase/firestore.rules
├── tests/logic.test.mjs      node tests/logic.test.mjs
└── docs/
```

## 6. Schéma de données

### `users/{uid}`
`uid`, `phone`, `role` (`merchant` | `courier` | `admin`), `name`, `businessName`, `commune`, `courierStatus` (`pending` | `approved` | null), `vehicleType`, `plate`, `online`, `createdAt`.
Tout compte naît commerçant ; il devient livreur par le formulaire d'inscription.

### `orders/{orderId}`
| Champ | Note |
|---|---|
| `id`, `code` | code lisible `LW-123456` |
| `status` | `pending` → `accepted` → `picked_up` → `delivered`, ou `cancelled` |
| `merchantId`, `merchantName`, `merchantPhone` | |
| `courierId`, `courierName`, `courierPhone`, `courierPlate` | null tant que personne n'a accepté |
| `vehicleType`, `serviceLevel` | `moto` ; `standard` ou `express` |
| `stops[]` | `{commune, landmark, contactName, contactPhone, lat?, lng?}` ; le premier est la récupération, le dernier la livraison |
| `parcel`, `note` | optionnels |
| `goodsAmount` | prix de la marchandise, 0 si aucun |
| `distanceKm`, `priceTotal`, `commission` | FCFA |
| `paymentMethod` | `cash_on_delivery` |
| `podHash` | SHA-256(code + orderId) |
| horodatages | `createdAt`, `acceptedAt`, `pickedUpAt`, `deliveredAt`, `cancelledAt`, `updatedAt` |

### `orders/{orderId}/private/secret`
`{ merchantId, deliveryCode }`, lisible par le commerçant seul.

### `wallets/{uid}`
`{ balance, tx[] }` avec `tx = { id, type, amount, ref, at }` et `type` = `topup` | `commission` | `commission_refund`. En production, écrit uniquement par le serveur.

## 7. API (contrat de `js/data/index.js`)

| Fonction | Rôle | Effet |
|---|---|---|
| `auth.startPhoneSignIn(phone)` → `confirm(code)` | tous | connexion par SMS |
| `auth.ensureProfile()` | tous | crée le profil commerçant à la première connexion |
| `auth.saveProfile(data)` | tous | nom, boutique, commune |
| `auth.becomeCourier(data)` | commerçant | inscription livreur : véhicule, immatriculation |
| `auth.setOnline(bool)` | livreur | disponibilité |
| `orders.create(input)` | commerçant | valide, calcule prix et commission, crée la commande et son code |
| `orders.watch / watchMine / watchAvailable / watchJobs` | selon le rôle | temps réel ; un livreur ne voit que les courses de son type de véhicule |
| `orders.accept(id)` | livreur validé | vérifie le solde, déduit la commission, attribue la course |
| `orders.pickUp(id)`, `orders.deliver(id, code)` | livreur attribué | étapes de la course ; le code du client valide la livraison |
| `orders.cancel(id)` | commerçant | avant récupération ; rembourse la commission |
| `orders.getDeliveryCode(id)` | commerçant | code à 4 chiffres |
| `wallet.watch(cb)`, `wallet.topUp(amount, method)` | livreur | solde, historique, recharge |

Endpoints serveur à écrire (Cloud Functions) : `POST /orders` (prix côté serveur), `POST /orders/{id}/accept` (débit de commission), `POST /wallet/topup` et `POST /payments/cinetpay/webhook`, envoi de SMS.

## 8. Interface

| Route | Écran | Accès |
|---|---|---|
| `#/` | Commander (carte + formulaire), ou accueil livreur | public |
| `#/login` | Téléphone puis code | public |
| `#/activity` | Activité du commerçant | connecté |
| `#/order/:id` | Suivi et actions | connecté |
| `#/wallet` | Portefeuille | livreur |
| `#/driver` | Devenir livreur | connecté |
| `#/account` | Compte | connecté |

Téléphone : carte en haut, formulaire dessous, barre d'onglets en bas. Ordinateur (900 px et plus) : formulaire à gauche, carte à droite, navigation dans la barre du haut.

## 9. Limites connues, à traiter avant un vrai lancement

1. **Le mode Firebase n'est pas prêt.** L'argent ne doit jamais être déplacé par le navigateur : recharge et commission exigent des Cloud Functions. En attendant, dans ce mode, le portefeuille est en lecture seule et l'acceptation ne prélève rien. Les règles Firestore n'ont pas été testées sur l'émulateur.
2. **Prix calculé côté client**, donc modifiable par un utilisateur malveillant tant que le serveur ne le recalcule pas.
3. **Code de livraison à 4 chiffres** vérifiable hors ligne par force brute : suffisant pour une démo.
4. **Tuiles OpenStreetMap** : le serveur public convient à une démo, pas à un trafic commercial. Prévoir un fournisseur de tuiles.
5. **Centres de communes approximatifs** ; la distance est estimée à vol d'oiseau puis majorée, sans calcul d'itinéraire.
6. **Images de véhicules** : illustrations 3D libres (Fluent Emoji, licence MIT), à remplacer par des photos si souhaité.
7. **Validation des livreurs** : immédiate en démo, manuelle ensuite ; les papiers ne sont pas envoyés.

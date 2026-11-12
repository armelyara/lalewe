Conçois l'interface complète de « Lalewe », une application mobile (PWA) de livraison à la demande pour les commerçants d'Abidjan, Côte d'Ivoire. Produit par The Day Info.

CONTEXTE
Un commerçant (vendeur en ligne, boutique) réserve une livraison en quelques secondes : il indique où récupérer le colis, où le livrer, le numéro du client, puis lance. Un livreur à moto accepte la course, récupère le colis et le remet au client contre un code à 4 chiffres. Deux profils : Commerçant et Livreur.

UTILISATEURS ET CONTRAINTES
- Téléphones Android d'entrée de gamme, écran 360 à 390 px de large, connexion 3G instable, usage en plein soleil et à une main.
- Interface 100 % en français, ton simple et direct. Prix en FCFA (ex. : 2 900 FCFA). Numéros ivoiriens à 10 chiffres.
- Les adresses se donnent par commune + repère (« en face de la pharmacie, portail vert »), pas par rue et numéro.
- Zones tactiles de 48 px minimum, contraste élevé, texte de 16 px minimum.

IDENTITÉ VISUELLE
- Couleur principale : orange vif [REMPLACER PAR LE CODE HEX THE DAY INFO], avec une variante foncée pour les états pressés et une variante très claire pour les fonds.
- Fond clair chaud, texte presque noir, vert pour « Livré », rouge pour « Annulé ».
- Style moderne, chaleureux, épuré. Cartes à coins arrondis, gros boutons, beaucoup d'air. Icônes au trait simples.
- Logo provisoire : le mot « Lalewe » en gras. Aucune photo, aucune illustration de personnage.

ÉCRANS À PRODUIRE (mobile, portrait)
1. Accueil de bienvenue : logo, phrase d'accroche « Vos livraisons à Abidjan, en quelques secondes », bouton Commencer.
2. Connexion — numéro de téléphone (préfixe +225).
3. Connexion — code de vérification à 6 chiffres reçu par SMS.
4. Inscription : choix « Je suis Commerçant / Livreur », nom complet, nom de la boutique (commerçant seulement), commune.
5. Accueil commerçant : salutation, gros bouton « Nouvelle livraison », liste « Mes livraisons » en cartes (code LW-123456, trajet Cocody → Yopougon, date, prix, pastille de statut). Prévoir l'état vide.
6. Nouvelle livraison (un seul écran défilant, ou 3 étapes courtes) :
   - Récupération : commune, repère précis, numéro sur place.
   - Livraison : commune, repère précis, nom du client, numéro du client.
   - Colis : description, montant à encaisser à la livraison (optionnel).
   - Véhicule : Moto (sélectionnable, « Jusqu'à 20 kg ») ; Tricycle, Camionnette, Camion affichés grisés avec la mention « Bientôt disponible ».
   - Délai : Standard ou Urgent.
   - Bandeau fixe en bas : prix de la course + bouton « Lancer la livraison ».
7. Suivi de commande, vue commerçant : pastille de statut, frise en 4 étapes (Commande créée, Livreur trouvé, Colis récupéré, Colis livré), bloc récupération et bloc livraison, détails (colis, véhicule, distance, prix, montant à encaisser), carte du livreur avec bouton Appeler, encadré mis en avant « Code de livraison à donner au client » avec le code en très grand, bouton discret « Annuler la livraison ».
   Montre 3 états : Recherche de livreur, Livreur en route, Livré.
8. Accueil livreur : salutation, interrupteur « Disponible pour livrer », liste « Courses disponibles », liste « Mes courses ». Prévoir l'état hors ligne et l'état « Compte en cours de validation ».
9. Détail de course, vue livreur : mêmes blocs que l'écran 7, boutons Appeler pour le commerçant et le client, action principale selon l'étape : « Accepter la course », puis « J'ai récupéré le colis », puis champ « Code donné par le client » + « Confirmer la livraison ».
10. Profil : téléphone, rôle, nom, boutique, commune, Enregistrer, Se déconnecter.
11. États transverses : message de confirmation (toast), message d'erreur de formulaire, écran hors connexion, chargement.

NAVIGATION
Barre du haut orange avec le logo. Barre d'onglets en bas : Accueil, Profil.

COMPOSANTS À DÉFINIR
Boutons (principal, secondaire, danger, désactivé), champs de saisie et liste déroulante, sélecteur segmenté, carte d'option véhicule (normale, sélectionnée, bientôt disponible), carte de commande, pastilles de statut (Recherche de livreur, Livreur en route, Colis récupéré, Livré, Annulé), frise de suivi, encadré de code, toast.

LIVRABLE
Tous les écrans en HTML et CSS statiques, sans framework ni bibliothèque JavaScript, avec les couleurs, rayons et espacements déclarés en variables CSS dans un seul bloc `:root`. Noms de classes clairs et réutilisables d'un écran à l'autre.

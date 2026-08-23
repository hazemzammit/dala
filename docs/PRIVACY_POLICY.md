# Politique de confidentialité — Dala (Chantier OS)

_Brouillon — Phase 12 (improvement-plan §10.5). Rédigé pour refléter ce que l'application
fait réellement, en lisant le code plutôt qu'en généralisant — chaque catégorie de
données ci-dessous correspond à une colonne/table réelle du schéma, pas à une formule
type. À faire réviser par un juriste avant publication ; ce document n'en tient pas
lieu._

## 1. Qui nous sommes

Dala (« Chantier OS ») est une plateforme de gestion de chantiers destinée aux
entreprises du bâtiment en Tunisie. Cette politique couvre l'application mobile, le
panneau d'administration web, et le portail client public.

## 2. Données que nous collectons

| Catégorie           | Exemples concrets                                                                       | Où c'est stocké                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité            | Nom complet, e-mail, numéro de téléphone (`profiles`)                                   | Supabase Postgres, chiffré au repos par le fournisseur                                                                                      |
| Localisation        | Coordonnées GPS optionnelles jointes à une photo de chantier (`expo-location`, Phase 3) | Champ associé à la photo, jamais suivi en continu — uniquement au moment de la prise de photo                                               |
| Photos              | Photos de chantier, justificatifs de dépense                                            | Supabase Storage, accès via URL signée à durée limitée                                                                                      |
| Données financières | RIB de l'entreprise (`organizations.rib`)                                               | **Chiffré au repos** via `pgsodium`/Vault (migration 0075) — jamais stocké en clair, jamais renvoyé en clair par une requête client directe |
| Voix                | Notes vocales jointes au journal de chantier (`expo-audio`)                             | Supabase Storage                                                                                                                            |
| Présence/paie       | Pointages, avances sur salaire, montants de paie                                        | Supabase Postgres                                                                                                                           |
| Usage technique     | Rapports d'erreur (Phase 12 — Sentry, voir §5 ci-dessous)                               | Sentry (sous-traitant)                                                                                                                      |

## 3. Pourquoi nous les collectons

Chaque catégorie ci-dessus sert exclusivement à la gestion opérationnelle d'un chantier
par l'entreprise qui vous emploie ou pour laquelle vous travaillez : suivi de présence,
gestion de la paie, documentation de l'avancement des travaux, communication avec le
client final via le portail. Aucune donnée n'est vendue ni partagée à des fins
publicitaires — Dala n'affiche aucune publicité et ne monétise aucune donnée utilisateur
de cette manière.

## 4. Qui peut voir vos données

L'accès est cloisonné par organisation via Row-Level Security (RLS) au niveau de la base
de données, pas seulement au niveau de l'interface — un travailleur ne peut techniquement
pas interroger les données d'une autre entreprise, même en contournant l'application.
Voir `docs/ARCHITECTURE.md` (« The one authorization pattern ») pour le détail technique.
Le portail client (lien + code PIN optionnel) donne un accès limité en lecture seule aux
factures d'un projet précis, jamais à l'ensemble des données de l'entreprise.

## 5. Sous-traitants tiers

- **Supabase** — hébergement base de données, authentification, stockage de fichiers.
- **Sentry** — rapports d'erreurs techniques (Phase 12, voir `lib/sentry.ts`). Ne reçoit
  que des informations de diagnostic (message d'erreur, pile d'appels) — jamais
  délibérément vos données personnelles, bien qu'un message d'erreur puisse
  accidentellement contenir un fragment de donnée si l'erreur elle-même en dépendait ;
  c'est un risque résiduel connu de tout outil de ce type, pas une collecte intentionnelle.
- **Resend** — envoi d'e-mails transactionnels (invitations, factures).

## 6. Combien de temps nous les conservons

Voir `docs/DATA_RETENTION_POLICY.md` pour le détail par table.

## 7. Vos droits

Vous pouvez demander la suppression de votre compte à tout moment depuis les paramètres
de l'application. Cette action est **irréversible** et retire l'accès à votre compte
immédiatement (voir `supabase/functions/delete-account`) — les données historiques liées
à l'entreprise (pointages passés, par exemple) qui appartiennent légalement à
l'entreprise elle-même (obligations comptables/légales tunisiennes) peuvent être
conservées par l'entreprise indépendamment de la suppression de votre compte personnel ;
ce document ne peut pas se substituer à un avis juridique sur cette distinction.

## 8. Verrouillage biométrique (Phase 12)

Si vous activez le verrouillage biométrique (Face ID / empreinte digitale) dans
Sécurité, cette préférence et toute donnée biométrique restent **entièrement locales à
votre appareil**, gérées par le système d'exploitation (iOS/Android) — Dala ne reçoit,
ne stocke, ni ne transmet jamais de donnée biométrique brute. Voir
`lib/biometricLock.ts`.

## 9. Contact

_[Adresse e-mail de contact à renseigner avant publication.]_

---

**Note aux mainteneurs :** ce document doit être republié à chaque changement de
sous-traitant ou de catégorie de donnée collectée — notamment si `expo-updates`/EAS
(Phase 12, §6.4) commence à collecter des métriques d'usage au-delà du simple
téléchargement de mise à jour, ce qui n'est pas configuré aujourd'hui mais est possible
selon la configuration EAS future.

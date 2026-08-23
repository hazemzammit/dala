# Politique de rétention et de suppression des données — Dala

Phase 12 (improvement-plan §10.5). Rédigé table par table à partir du schéma réel
(`supabase/migrations/`), pas de manière générique. À faire réviser par un juriste avant
publication.

## Principe général

Ce produit distingue deux catégories de données, chacune avec une logique de rétention
différente :

1. **Données opérationnelles append-only** (pointages, avances, journal de chantier) —
   conservées indéfiniment par défaut, car elles constituent l'historique comptable/
   légal de l'entreprise (obligations fiscales tunisiennes de conservation des registres
   de paie), pas seulement une donnée personnelle de l'utilisateur qui les a saisies.
2. **Données de compte personnel** (profil, préférences) — supprimées à la demande via
   le flux de suppression de compte existant.

| Table / donnée                                         | Politique de rétention                                                                                                                                          | Mécanisme                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `profiles` (identité)                                  | Supprimée à la demande de l'utilisateur                                                                                                                         | `supabase/functions/delete-account` (existant)                                   |
| `organizations.rib`                                    | Conservée tant que l'organisation existe ; chiffrée au repos                                                                                                    | Migration 0075                                                                   |
| `attendance_records`, `advances`, `site_logs`          | Conservées indéfiniment (registre comptable/légal de l'entreprise) — append-only par construction (Doc 01 §1.9.1), jamais purgées automatiquement               | Aucune purge automatique n'existe aujourd'hui — décision délibérée, pas un oubli |
| Photos (Supabase Storage)                              | Conservées tant que la ligne qui les référence existe                                                                                                           | Suppression en cascade avec la ligne parente                                     |
| `edge_function_rate_limits` (Phase 12, §10.4)          | Purgée automatiquement après 1 jour                                                                                                                             | `cron.schedule('purge-rate-limit-rows', ...)`, migration 0077                    |
| Événements Sentry (Phase 12, §10.3)                    | Selon la politique de rétention par défaut de Sentry pour le plan souscrit — à confirmer une fois un projet Sentry réel provisionné ; non contrôlée par ce code | N/A — sous-traitant tiers                                                        |
| Notifications push (`audit_log` / notification tables) | Non auditée dans le cadre de cette phase — flaggé comme point à couvrir dans une prochaine revue                                                                | —                                                                                |

## Suppression de compte — ce qui part, ce qui reste

En lisant `delete-account`'s propre logique avant d'écrire cette section (pas supposé) :
la suppression `auth.users` déclenche un `on delete cascade` qui retire `profiles`,
`organization_members`, et toute ligne directement liée par clé étrangère à cet
utilisateur. Les lignes append-only qu'un travailleur a _générées_ pour le compte de
l'entreprise (un pointage qu'il a lui-même badgé, par exemple) référencent
`workers.id`/`org_id`, pas directement `auth.users.id` sur cette table précise — elles
survivent à la suppression du compte personnel, ce qui est le comportement voulu : elles
appartiennent au registre de l'entreprise, pas au compte personnel qui les a saisies.

## Ce qui manque encore, disclosed plutôt que masqué

- Aucune purge automatique n'existe pour les données opérationnelles au-delà d'une
  durée donnée — si une future exigence légale impose une purge après N années, ce sera
  un nouveau travail de migration, pas quelque chose que ce document peut promettre
  aujourd'hui.
- Le nom exact et la durée de rétention du sous-traitant Sentry (Phase 12) ne sont pas
  encore confirmés — dépend du plan Sentry réellement souscrit, hors de portée de ce
  sandbox.

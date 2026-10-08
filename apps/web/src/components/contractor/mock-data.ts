/**
 * apps/web/src/components/contractor/mock-data.ts
 *
 * Loose-end cleanup (found during the web shell consistency pass, Phase
 * 17 audit had already flagged this file) — this used to hold six
 * exports of fabricated English placeholder data (fake stat numbers, a
 * fake cashflow chart, fake activity feed, fake weekly calendar).
 * DashboardView.tsx now computes its real stats itself and never
 * imported the other five; they were dead code left over from an early
 * scaffold. Only `quickActions` was both real (a genuine set of
 * dashboard shortcuts, not fabricated data) and actually imported —
 * kept, translated to French, and its "Log expense -> /billing" entry
 * replaced with "Ajouter un matériau -> /materials?create=1" (a real
 * deep link, same ?create=1-opens-modal convention Projects/Vehicles/Team
 * already use — MaterialsView.tsx gained the same handling in this pass).
 */
import {
  BuildingsIcon,
  ChartBarIcon,
  HardHatIcon,
  PackageIcon,
  TruckIcon,
  CarIcon,
} from '@phosphor-icons/react';

export const quickActions = [
  { label: 'Nouveau chantier', href: '/projects?create=1', icon: BuildingsIcon },
  { label: 'Affecter un dispatch', href: '/dispatch', icon: TruckIcon },
  { label: 'Ajouter un véhicule', href: '/vehicles?create=1', icon: CarIcon },
  { label: 'Inviter un ouvrier', href: '/team?invite=1', icon: HardHatIcon },
  { label: 'Ajouter un matériau', href: '/materials?create=1', icon: PackageIcon },
  { label: 'Voir les rapports', href: '/reports', icon: ChartBarIcon },
] as const;

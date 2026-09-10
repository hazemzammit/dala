import type { PROJECT_TYPES } from '@dala/validation';
import {
  BuildingApartmentIcon,
  BuildingsIcon,
  FactoryIcon,
  HammerIcon,
  HouseIcon,
  RoadHorizonIcon,
} from 'phosphor-react-native';

/**
 * apps/mobile/src/lib/projectTypeMeta.ts
 *
 * UI/UX pass (Chantiers audit) — `project_type` (migration 0028,
 * PROJECT_TYPES in packages/validation) had a text-chip picker in the
 * create/edit form but no visual identity anywhere in the read views: a
 * project card showed name/client/status only, with type not represented
 * at all. This is the single place that maps each type to an icon + a
 * `categorical` token (packages/design-tokens) — the project card's icon
 * chip and any future summary/filter UI both read from here, so the
 * mapping can't drift between call sites the way ad-hoc per-screen colors
 * tend to.
 *
 * Three category colors across six project types is deliberate — see
 * design-tokens' own comment on `color.categorical` for why this isn't
 * six distinct hues.
 */
type ProjectType = (typeof PROJECT_TYPES)[number];
type CategoricalKey = 'categoricalBlue' | 'categoricalViolet' | 'categoricalAmber';

interface ProjectTypeMeta {
  icon: typeof HouseIcon;
  colorKey: CategoricalKey;
}

export const PROJECT_TYPE_META: Record<ProjectType, ProjectTypeMeta> = {
  residentiel: { icon: HouseIcon, colorKey: 'categoricalBlue' },
  commercial: { icon: BuildingApartmentIcon, colorKey: 'categoricalViolet' },
  industriel: { icon: FactoryIcon, colorKey: 'categoricalAmber' },
  renovation: { icon: HammerIcon, colorKey: 'categoricalBlue' },
  infrastructure: { icon: RoadHorizonIcon, colorKey: 'categoricalViolet' },
  autre: { icon: BuildingsIcon, colorKey: 'categoricalAmber' },
};

export function getProjectTypeMeta(type: string | null | undefined): ProjectTypeMeta {
  if (type && type in PROJECT_TYPE_META) return PROJECT_TYPE_META[type as ProjectType];
  return { icon: BuildingsIcon, colorKey: 'categoricalBlue' };
}

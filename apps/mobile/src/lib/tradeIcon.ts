import type { Icon3DConstructionName } from '@/components/ui/icons3d-construction';

/**
 * apps/mobile/src/lib/tradeIcon.ts
 *
 * IMPROVEMENT-PLAN Part B — worker.trade icon mapping. The guide's own B2
 * table assumed profession-agent trade values (`'Électricien'`,
 * `'Plombier'`, `'Charpentier'`, `'Ingénieur'`, `'Architecte'`) — checked
 * against the actual closed list this field is drawn from
 * (`TRADE_OPTIONS` in pickerOptions.ts, wired through a `<Select>`, NOT
 * free text as the guide assumed) and none of those five strings appear
 * anywhere in it. The real list is trade-DOMAIN nouns: Plomberie,
 * Électricité, Maçonnerie, Peinture, Climatisation, Vacuum central,
 * Menuiserie, Carrelage, Gros œuvre, Second œuvre, Rénovation générale.
 * Every guide-proposed `trade === X` condition as originally written
 * would simply never have matched real data.
 *
 * Remapped against the real 11 values, using only icons that actually
 * exist in icons3d-construction.ts:
 * - Plomberie → plumber (direct match, guide's own plumber.png intent)
 * - Électricité → electrician (direct match)
 * - Menuiserie → carpenter-person (guide's own carpenter-person.png
 *   intent, just corrected from 'Charpentier' to the real value; picked
 *   over carpenter-tools as canonical since every other trade icon here
 *   is a person-render, not a tool-render — visual consistency across the
 *   set matters more than either alone)
 * - Gros œuvre ("shell/structural work") → structural-engineer — a
 *   judgment call, not a direct name match the way the three above are;
 *   flagged here as the one inference in this table
 * - Peinture, Climatisation, Vacuum central, Carrelage, Second œuvre,
 *   Rénovation générale — no matching person-icon exists in the
 *   delivered set (no painter/HVAC/tiler/finishing-work render). These
 *   fall through to the generic `safety-helmet` fallback, exactly as the
 *   guide's own row for `safety-helmet.png` already specifies for "trade
 *   doesn't match a known profession."
 *
 * `architect`, `urban-planner`, `interior-designer`, `gas-installer`,
 * `engineer` stay unwired — the guide itself already hedged these as
 * "reserve — wire in as you confirm which trade values actually appear in
 * real data," and now confirmed: none of the 11 real values name any of
 * these five professions. Held in reserve, not force-matched.
 */
const TRADE_ICON_MAP: Record<string, Icon3DConstructionName> = {
  Plomberie: 'plumber',
  Électricité: 'electrician',
  Menuiserie: 'carpenter-person',
  'Gros œuvre': 'structural-engineer',
};

export function tradeIcon(trade: string | null | undefined): Icon3DConstructionName {
  return (trade && TRADE_ICON_MAP[trade]) || 'safety-helmet';
}

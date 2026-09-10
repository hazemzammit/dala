/**
 * apps/mobile/src/components/ui/icons3d.ts
 *
 * IMPROVEMENT-PLAN Part A foundation. Neither this file nor Icon3D.tsx
 * shipped in dala-icons-3d-package.zip — the guide describes them as
 * "already scaffolded," but the zip contained 62 PNGs and zero .ts/.tsx
 * files. Both were authored from scratch here, modeled on the existing
 * illustrations.ts / Illustration.tsx pattern.
 *
 * The 62 delivered PNGs vs. this registry's 54 entries — accounted for:
 *
 * - 6 excluded as leftover duplicates: Danger, empty-result, exit, more,
 *   pin, plus. The guide's own dedup pass (A3) already decided these were
 *   redundant with icons kept under a different name (e.g. `exit` duplicates
 *   `logout`, `empty-result` duplicates `no-data`) — they just weren't
 *   actually removed from what got zipped. Excluded here rather than
 *   imported unused.
 * - 2 excluded as ungrounded orphans, NOT covered by the dedup list and
 *   NOT any confirmed slug in the guide's A2 table:
 *     - `Blue-Profile-Icon.png` — plausibly intended as the `profile-placeholder`
 *       fallback (Avatar.tsx has no fallback icon today), but nothing in
 *       the guide actually names it that, and profile-placeholder is one
 *       of the 5 confirmed-missing icons below. Renaming it into that slot
 *       would be a guess dressed up as a fact. Left out; revisit once
 *       Avatar.tsx's fallback is actually being wired.
 *     - `bell.png` — sits right next to `bell-alert.png` (which IS a
 *       confirmed A2 slug, for the push-permission prompt) with no
 *       separate use anywhere in the guide. Reads like another duplicate
 *       the dedup pass missed, same shape as the 6 above — excluded on
 *       the same reasoning, not kept as a mystery extra.
 * - 5 genuinely missing from the zip, not excludable, not substitutable:
 *   `file-checkmark`, `profile-placeholder`, `bank`, `gauge-meter`,
 *   `hourglass`. Screens waiting on these (Avatar.tsx fallback,
 *   organization-settings.tsx, billing.tsx, data-export.tsx/team.tsx,
 *   reports.tsx/safety.tsx reviewed-doc states) are deferred, not wired to
 *   a wrong icon as a placeholder.
 *
 * 62 − 6 − 2 − 5(never present) = 54 entries below — no gap left
 * unaccounted for in either direction.
 */
import alarmClockRed from '@/assets/icons-3d/alarm-clock-red.png';
import answer from '@/assets/icons-3d/answer.png';
import archiveBox from '@/assets/icons-3d/archive-box.png';
import award from '@/assets/icons-3d/award.png';
import bellAlert from '@/assets/icons-3d/bell-alert.png';
import bookmark from '@/assets/icons-3d/bookmark.png';
import calendarPlus from '@/assets/icons-3d/calendar-plus.png';
import calendar from '@/assets/icons-3d/calendar.png';
import cameraPhoto from '@/assets/icons-3d/camera-photo.png';
import chatBubble from '@/assets/icons-3d/chat-bubble.png';
import checkmarkCircle from '@/assets/icons-3d/checkmark-circle.png';
import creditCardWarning from '@/assets/icons-3d/credit-card-warning.png';
import document from '@/assets/icons-3d/document.png';
import downloadFile from '@/assets/icons-3d/download-file.png';
import emergency from '@/assets/icons-3d/emergency.png';
import fingerprint from '@/assets/icons-3d/fingerprint.png';
import forgotPassword from '@/assets/icons-3d/forgot-password.png';
import handCoins from '@/assets/icons-3d/hand-coins.png';
import idVerified from '@/assets/icons-3d/id-verified.png';
import info from '@/assets/icons-3d/info.png';
import key from '@/assets/icons-3d/key.png';
import linkChain from '@/assets/icons-3d/link-chain.png';
import locationPin from '@/assets/icons-3d/location-pin.png';
import lockOpen from '@/assets/icons-3d/lock-open.png';
import logout from '@/assets/icons-3d/logout.png';
import mailQuestion from '@/assets/icons-3d/mail-question.png';
import noData from '@/assets/icons-3d/no-data.png';
import noInternet from '@/assets/icons-3d/no-internet.png';
import offline from '@/assets/icons-3d/offline.png';
import packageCheck from '@/assets/icons-3d/package-check.png';
import pdfDocument from '@/assets/icons-3d/pdf-document.png';
import prohibited from '@/assets/icons-3d/prohibited.png';
import question from '@/assets/icons-3d/question.png';
import returnItem from '@/assets/icons-3d/return-item.png';
import roadmap from '@/assets/icons-3d/roadmap.png';
import settingsGear from '@/assets/icons-3d/settings-gear.png';
import share from '@/assets/icons-3d/share.png';
import shieldLock from '@/assets/icons-3d/shield-lock.png';
import sync from '@/assets/icons-3d/sync.png';
import team from '@/assets/icons-3d/team.png';
import timeline from '@/assets/icons-3d/timeline.png';
import toDoList from '@/assets/icons-3d/to-do-list.png';
import toggleSwitch from '@/assets/icons-3d/toggle-switch.png';
import trashWarning from '@/assets/icons-3d/trash-warning.png';
import trending from '@/assets/icons-3d/trending.png';
import unverifiedShield from '@/assets/icons-3d/unverified-shield.png';
import uploadFile from '@/assets/icons-3d/upload-file.png';
import verifiedBadge from '@/assets/icons-3d/verified-badge.png';
import verifiedShield from '@/assets/icons-3d/verified-shield.png';
import walletCash from '@/assets/icons-3d/wallet-cash.png';
import warningCircle from '@/assets/icons-3d/warning-circle.png';
import wifi from '@/assets/icons-3d/wifi.png';
import workflow from '@/assets/icons-3d/workflow.png';
import xCircle from '@/assets/icons-3d/x-circle.png';

export const icons3d = {
  'checkmark-circle': checkmarkCircle,
  'x-circle': xCircle,
  'warning-circle': warningCircle,
  prohibited,
  'verified-badge': verifiedBadge,
  'verified-shield': verifiedShield,
  'unverified-shield': unverifiedShield,
  'id-verified': idVerified,
  award,
  'shield-lock': shieldLock,
  key,
  'lock-open': lockOpen,
  fingerprint,
  logout,
  'pdf-document': pdfDocument,
  document,
  'download-file': downloadFile,
  'upload-file': uploadFile,
  'archive-box': archiveBox,
  'trash-warning': trashWarning,
  'hand-coins': handCoins,
  'wallet-cash': walletCash,
  'credit-card-warning': creditCardWarning,
  'location-pin': locationPin,
  'link-chain': linkChain,
  share,
  wifi,
  'no-internet': noInternet,
  offline,
  sync,
  'bell-alert': bellAlert,
  'mail-question': mailQuestion,
  'chat-bubble': chatBubble,
  question,
  answer,
  info,
  calendar,
  'calendar-plus': calendarPlus,
  'alarm-clock-red': alarmClockRed,
  timeline,
  roadmap,
  workflow,
  'to-do-list': toDoList,
  'return-item': returnItem,
  'settings-gear': settingsGear,
  'toggle-switch': toggleSwitch,
  team,
  bookmark,
  trending,
  emergency,
  'no-data': noData,
  'forgot-password': forgotPassword,
  'camera-photo': cameraPhoto,
  'package-check': packageCheck,
} as const;

export type Icon3DName = keyof typeof icons3d;

/**
 * Scene-tier icons — multi-element compositions that need more room than
 * the 64px glyph-tier default. Decided by opening each PNG, not from
 * filenames:
 * - roadmap: a road + flag + three pins on a map — a spatial tableau
 * - workflow: connected flowchart nodes + a checkmark + a calendar + a gear
 * - timeline: three linked milestone markers on a base
 * - team: two people figures + two gears composed together
 * - trending: a chart card with two plotted lines and an arrow
 * Everything else in the set (including visually two-part icons like
 * `no-data` or `emergency`) reads as one cohesive object at 64px and
 * stays glyph-tier.
 */
export const SCENE_ICONS = new Set<Icon3DName>([
  'roadmap',
  'workflow',
  'timeline',
  'team',
  'trending',
]);

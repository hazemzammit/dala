/**
 * apps/mobile/src/components/ui/illustrations.ts
 *
 * Registry of unDraw illustrations (recolored to accent-600, see
 * src/assets/illustrations/) actually wired into a screen. Metro can't
 * resolve a dynamic `require(`./${slug}.svg`)` — every import has to be a
 * static string literal — so this file is the one place that maps a short
 * semantic key to its concrete asset. All 181 recolored SVGs ship in
 * src/assets/illustrations/ for future use; to wire up a new one, add a
 * static import + registry entry here, then reference it by key from
 * <EmptyState illustration="..." /> or <Illustration name="..." />.
 */
import Agreement from '@/assets/illustrations/undraw_agreement_ftet.svg';
import AlarmClock from '@/assets/illustrations/undraw_alarm-clock_zgtg.svg';
import CheckBoxes from '@/assets/illustrations/undraw_check-boxes_x5fg.svg';
import CleanUp from '@/assets/illustrations/undraw_clean-up_af4s.svg';
import Confirmed from '@/assets/illustrations/undraw_confirmed_c5lo.svg';
import ConnectionLost from '@/assets/illustrations/undraw_connection-lost_am29.svg';
import Destination from '@/assets/illustrations/undraw_destination_fkst.svg';
import DocumentReady from '@/assets/illustrations/undraw_document-ready_o5d5.svg';
import ExportFiles from '@/assets/illustrations/undraw_export-files_gc69.svg';
import GlobalTeam from '@/assets/illustrations/undraw_global-team_8jok.svg';
import HandshakeDeal from '@/assets/illustrations/undraw_handshake-deal_nwk6.svg';
import InvestorUpdate from '@/assets/illustrations/undraw_investor-update_ou4c.svg';
import MailSent from '@/assets/illustrations/undraw_mail-sent_ujev.svg';
import Maintenance from '@/assets/illustrations/undraw_maintenance_4unj.svg';
import MobileAnalytics from '@/assets/illustrations/undraw_mobile-analytics_bz2a.svg';
import MobilePay from '@/assets/illustrations/undraw_mobile-pay_yho9.svg';
import MobilePayments from '@/assets/illustrations/undraw_mobile-payments_uate.svg';
import OnlinePayments from '@/assets/illustrations/undraw_online-payments_d5ef.svg';
import OnlineRevenue from '@/assets/illustrations/undraw_online-revenue_6egl.svg';
import OrganizePhotos from '@/assets/illustrations/undraw_organize-photos_t5k9.svg';
import PageNotFound from '@/assets/illustrations/undraw_page-not-found_6wni.svg';
import Payments from '@/assets/illustrations/undraw_payments_nbqu.svg';
import PropertyAgreement from '@/assets/illustrations/undraw_property-agreement_olsb.svg';
import PushNotifications from '@/assets/illustrations/undraw_push-notifications_5z1s.svg';
import Receipt from '@/assets/illustrations/undraw_receipt_tzi0.svg';
import RoutePlanning from '@/assets/illustrations/undraw_route-planning_2psv.svg';
import SendMoney from '@/assets/illustrations/undraw_send-money_4qc7.svg';
import TeamAssignment from '@/assets/illustrations/undraw_team-assignment_lzot.svg';
import TeamCollaboration from '@/assets/illustrations/undraw_team-collaboration_phnf.svg';
import Team from '@/assets/illustrations/undraw_team_85hs.svg';
import ToDoApp from '@/assets/illustrations/undraw_to-do-app_esjl.svg';
import UnderConstruction from '@/assets/illustrations/undraw_under-construction_c2y1.svg';
import UserAccount from '@/assets/illustrations/undraw_user-account_fvqa.svg';
import Vault from '@/assets/illustrations/undraw_vault_tyfh.svg';
import Warning from '@/assets/illustrations/undraw_warning_tl76.svg';

export const illustrations = {
  'connection-lost': ConnectionLost,
  'route-planning': RoutePlanning,
  'mobile-pay': MobilePay,
  'mail-sent': MailSent,
  maintenance: Maintenance,
  confirmed: Confirmed,
  'under-construction': UnderConstruction,
  'team-collaboration': TeamCollaboration,
  destination: Destination,
  'global-team': GlobalTeam,
  'to-do-app': ToDoApp,
  'check-boxes': CheckBoxes,
  receipt: Receipt,
  agreement: Agreement,
  'organize-photos': OrganizePhotos,
  warning: Warning,
  'online-revenue': OnlineRevenue,
  team: Team,
  'mobile-analytics': MobileAnalytics,
  'page-not-found': PageNotFound,
  'alarm-clock': AlarmClock,
  'send-money': SendMoney,
  payments: Payments,
  'clean-up': CleanUp,
  'export-files': ExportFiles,
  'push-notifications': PushNotifications,
  // IMPROVEMENT-PLAN Part C — illustration reuse fix. 8 slugs from the
  // guide's own list, plus `vault` (used by vehicle/[id].tsx's documents
  // tab per the guide's own C2 table, but missing from its "8 new
  // entries" list — a real gap in the guide, not an intentional omission;
  // the SVG already ships unused in assets/illustrations, same as the
  // other 8).
  'document-ready': DocumentReady,
  'handshake-deal': HandshakeDeal,
  'investor-update': InvestorUpdate,
  'mobile-payments': MobilePayments,
  'online-payments': OnlinePayments,
  'property-agreement': PropertyAgreement,
  'team-assignment': TeamAssignment,
  'user-account': UserAccount,
  vault: Vault,
} as const;

export type IllustrationName = keyof typeof illustrations;

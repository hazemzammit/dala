/**
 * @dala/shared-types
 *
 * Hand-written domain types mirroring supabase/migrations/*.sql.
 *
 * IMPORTANT — READ BEFORE EDITING:
 * This file is imported by mobile, web, and admin. Before extending or
 * changing anything here, re-read the CURRENT contents of this file and the
 * relevant migration(s) — do not assume the shape from memory or from an
 * earlier version you've seen. This file drifting from the real schema is
 * the single most common source of "works on my machine" bugs in this repo.
 *
 * Once `supabase gen types typescript` is wired up (see root package.json's
 * `db:types` script), `database.generated.ts` becomes the literal source of
 * truth for table shapes, and the hand-written types below should be thin
 * convenience aliases over it rather than a second hand-maintained copy.
 */

// ---------------------------------------------------------------------------
// Enums / literal unions — keep these in sync with CHECK constraints in SQL.
// ---------------------------------------------------------------------------

export type Locale = 'fr' | 'ar' | 'en';
export type Platform = 'mobile' | 'web';
export type OrgRole = 'owner' | 'manager' | 'viewer';
export type ProjectMembershipRole = 'lead' | 'trade' | 'client';
export type ProjectStatus = 'active' | 'completed' | 'archived';

/**
 * Doc 03 §3.10.3 "Type de projet" — migration 0028. Spec never enumerates
 * the values (just "select, Required"); this is the Phase 7 judgment call,
 * see that migration's header comment.
 */
export type ProjectType =
  'residentiel' | 'commercial' | 'industriel' | 'renovation' | 'infrastructure' | 'autre';
export type VehicleStatus = 'available' | 'in_use' | 'maintenance';
export type InvitationChannel = 'app' | 'whatsapp' | 'sms';
export type InvitationStatus = 'pending' | 'accepted' | 'expired';
/** migration 0024 — org-to-org invites have no 'app' channel: the invited
 *  org has no session/app-notification target to reach until it accepts,
 *  unlike a worker invite where the org itself is already in the app.
 *  'email' is added since Doc 02 §2.8 invites "by phone or email". */
export type OrgInvitationChannel = 'whatsapp' | 'sms' | 'email';
export type AttendanceStatus = 'present' | 'absent' | 'half_day';
export type AttendanceSource = 'dispatch_checkin' | 'manual_pointage';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ExpenseCategory = 'materiaux' | 'carburant' | 'sous_traitance' | 'autre';
export type SalaryCycleStatus = 'pending' | 'paid';
export type IncidentSeverity = 'minor' | 'moderate' | 'severe';
export type ConfirmationChannel = 'app' | 'whatsapp' | 'call' | 'sms';

// ---------------------------------------------------------------------------
// Core tables
// ---------------------------------------------------------------------------

export interface Profile {
  id: string; // uuid, references auth.users(id)
  full_name: string;
  phone: string | null;
  email_verified_at: string | null; // ISO timestamp
  preferred_locale: Locale;
  avatar_url: string | null;
  active_org_id: string | null;
  profile_checklist_dismissed_at: string | null;
  suspended_at: string | null; // 0019 — Doc 04 §4.3.4, admin-only write path
  created_at: string;
  last_login_at: string | null;
  last_login_platform: Platform | null;
  expo_push_token: string | null; // migration 0025 — Doc 02 §2.9a
  notification_prefs: NotificationPrefs; // migration 0025 — Doc 03 §3.23 / Doc 02 §2.9a
  deletion_requested_at: string | null; // migration 0028 — Doc 03 §3.22 "Supprimer mon compte"
}

/** migration 0025 — Doc 03 §3.23 per-category push toggles + Doc 02 §2.9a
 *  digest opt-in. Per-account (profiles), not per-org — see activeOrg.ts's
 *  note that a digest isn't scoped to whichever org is currently active. */
export type DigestFrequency = 'off' | 'daily' | 'weekly';

export interface NotificationPrefs {
  dispatch: boolean;
  advances: boolean;
  materials: boolean;
  safety: boolean;
  digest_frequency: DigestFrequency;
}

export interface Organization {
  id: string;
  name: string;
  trade_type: string | null;
  logo_url: string | null;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  matricule_fiscal: string | null;
  rc_number: string | null;
  plan: string;
  org_checklist_dismissed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  suspended_at: string | null; // 0019 — Doc 04 §4.3.3, admin-only write path
  deleted_at: string | null; // 0019 — Doc 04 §4.3.3, 30-day recoverable soft-delete
}

// ---------------------------------------------------------------------------
// Platform Admin (admin-only tables; never read/written by mobile or web)
// ---------------------------------------------------------------------------

export type PlatformAdminRole = 'super_admin' | 'admin' | 'support';

export interface PlatformAdmin {
  id: string;
  full_name: string;
  role: PlatformAdminRole;
  totp_enabled: boolean;
  allowed_ips: string[] | null;
  last_login_at: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_type: 'user' | 'platform_admin' | 'system';
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  impersonated_user_id: string | null;
  impersonation_reason: string | null;
  created_at: string;
}

export interface OrganizationMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  joined_at: string;
}

export interface Worker {
  id: string;
  org_id: string;
  full_name: string;
  email: string | null; // migration 0017 — required by the app for new invites (Doc 00 §0.5 item 10), nullable at the DB layer only
  phone: string | null;
  trade: string | null;
  daily_rate: number | null;
  user_id: string | null;
  created_at: string;
  deleted_at: string | null; // migration 0025 — Doc 02 §2.10, 30-day recoverable soft-delete (same pattern as Project.deleted_at)
}

export interface WorkerInvitation {
  id: string;
  worker_id: string;
  token: string;
  channel: InvitationChannel;
  status: InvitationStatus;
  sent_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface Project {
  id: string;
  lead_org_id: string;
  name: string;
  client_name: string | null;
  address: string | null;
  budget_total: number | null;
  status: ProjectStatus;
  start_date: string | null; // migration 0028 — Doc 03 §3.10.3
  project_type: ProjectType | null; // migration 0028 — Doc 03 §3.10.3
  deleted_at: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMembership {
  id: string;
  project_id: string;
  org_id: string;
  role: ProjectMembershipRole;
  budget_rollup_opt_in: boolean;
  report_branding_opt_out: boolean; // migration 0024 — Doc 02 §2.8 report branding
  created_at: string;
}

/** migration 0024 — Doc 02 §2.8 org-to-org invite. `invited_org_id` is null
 *  until accepted (the invited org may not exist yet — see Doc 02 §2.8's
 *  "invite doubles as onboarding link" flow). */
export interface ProjectInvitation {
  id: string;
  project_id: string;
  lead_org_id: string;
  invited_org_id: string | null;
  invited_phone: string | null;
  invited_email: string | null;
  trade_type: string | null;
  token: string;
  sent_via: OrgInvitationChannel;
  status: InvitationStatus;
  created_by: string;
  sent_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface Vehicle {
  id: string;
  org_id: string;
  name: string;
  plate: string | null;
  capacity: number;
  status: VehicleStatus;
  created_at: string;
}

export interface DispatchAssignment {
  id: string;
  org_id: string;
  project_id: string | null;
  vehicle_id: string | null;
  worker_id: string;
  assignment_date: string; // date, YYYY-MM-DD
  departure_time: string | null;
  confirmation_channel: ConfirmationChannel | null;
  actual_departure_time: string | null;
  version: number;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  org_id: string;
  worker_id: string;
  project_id: string | null;
  record_date: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  recorded_by: string | null;
  created_at: string;
}

export interface Advance {
  id: string;
  org_id: string;
  worker_id: string;
  amount: number;
  reason: string | null;
  status: ApprovalStatus;
  requested_by: string | null;
  approved_by: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface ProjectExpense {
  id: string;
  org_id: string;
  project_id: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  receipt_photo_url: string | null;
  expense_date: string;
  created_by: string;
  created_at: string;
}

export interface SalaryCycle {
  id: string;
  org_id: string;
  worker_id: string;
  cycle_start: string;
  cycle_end: string;
  status: SalaryCycleStatus;
  paid_at: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface Material {
  id: string;
  org_id: string;
  project_id: string | null;
  item: string;
  quantity: number | null;
  urgency: 'normal' | 'urgent';
  note: string | null;
  status: ApprovalStatus;
  rejection_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  // migration 0020 — Doc 03 §3.15 "Réassigner": who the request is now
  // routed to, independent of created_by (who originally asked).
  assigned_worker_id: string | null;
  created_at: string;
}

export interface SiteLog {
  id: string;
  org_id: string;
  project_id: string;
  // migration 0020 — nullable now: "at least one of photo/voice/text" (Doc
  // 03 §4.2) replaced the old photo-mandatory shape.
  photo_url: string | null;
  voice_note_url: string | null;
  note_text: string | null;
  thumbnail_url: string | null;
  idempotency_key: string | null;
  location_lat: number | null;
  location_lng: number | null;
  caption: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface SafetyIncident {
  id: string;
  org_id: string;
  project_id: string | null;
  description: string;
  severity: IncidentSeverity;
  location: string | null; // migration 0020
  photo_url: string | null;
  reported_by: string | null;
  created_at: string;
}

/** migration 0020 — Doc 03 §3.17 involved-worker multi-select, many-to-many. */
export interface SafetyIncidentWorker {
  incident_id: string;
  worker_id: string;
}

export interface OrgInsurance {
  id: string;
  org_id: string;
  provider_name: string;
  policy_number: string | null;
  coverage_type: string | null; // migration 0020
  reminder_enabled: boolean; // migration 0020
  document_url: string | null;
  expires_at: string | null;
  created_at: string;
}

/** migration 0020 — Doc 02 §2.7 / Doc 03 §3.18. `pin_hash` never leaves the DB. */
export interface ClientPortal {
  id: string;
  org_id: string;
  project_id: string;
  link_token: string;
  pin_enabled: boolean;
  failed_pin_attempts: number;
  locked_until: string | null;
  last_reset_at: string | null;
  last_reset_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppVersion {
  platform: 'ios' | 'android';
  latest_version: string;
  min_supported_version: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Composite / derived types used across screens (not 1:1 tables)
// ---------------------------------------------------------------------------

/** The two independent role systems, composed but never merged. Doc 01 §1.4. */
export interface EffectivePermissions {
  orgRole: OrgRole | null;
  projectMembershipRole: ProjectMembershipRole | null;
}

export interface SearchResult {
  entity_type: 'project' | 'worker' | 'vehicle';
  id: string;
  label: string;
  rank: number;
}

/** migration 0025 — return shape of get_worker_lateness_pattern(), Doc 02
 *  §2.2/§2.9 Tier 0. day_of_week follows Postgres extract(dow): 0 = Sunday
 *  .. 6 = Saturday. Rows only appear once sample_count >= 4 for that day
 *  (enforced in SQL, not here) — this type describes what's returned, not
 *  the display-worthiness threshold itself. */
export interface WorkerLatenessPattern {
  day_of_week: number;
  avg_lateness_min: number;
  sample_count: number;
}

/** migration 0025 — return shape of get_digest_summary(), Doc 02 §2.9a. */
export interface DigestSummary {
  pending_advances_count: number;
  pending_materials_count: number;
  tomorrow_dispatch_planned: boolean;
  week_advances_total: number;
}

/** Doc 02 §2.10 Trash screen — a soft-deleted project or worker, normalized
 *  to one shape so the Trash screen can render both entity types in a
 *  single list without a union of near-identical row components. Composed
 *  client-side from Project/Worker rows where deleted_at is not null, not
 *  a table of its own. */
export interface TrashItem {
  entity_type: 'project' | 'worker';
  id: string;
  label: string;
  deleted_at: string;
}

// ---------------------------------------------------------------------------
// Platform Admin (apps/admin) — Doc 06 §6.3
//
// Moved here from being defined locally/inline inside apps/admin's own
// route files, where they'd drifted since first written (a prior session's
// notes claimed these three already lived here; a fresh read found they
// didn't — admin's routes had their own local equivalents instead). Real
// value in having them here: apps/web/apps/mobile can now consume the same
// `Announcement` shape that get_active_in_app_announcements() (migration
// 0030) returns, without redefining it, if either app builds against that
// RPC.
// ---------------------------------------------------------------------------

/** `announcements` table (migration 0022) + `delivered_at` (migration
 *  0030). channels/target_type mirror the CHECK constraints in 0022 —
 *  kept as string unions here so a constraint change needs a matching
 *  type change, not just a migration. */
export interface Announcement {
  id: string;
  message: string;
  channels: ('push' | 'email' | 'in_app')[];
  target_type: 'all_users' | 'owners_only' | 'by_plan' | 'by_trade_type' | 'inactive_30d';
  target_value: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  /** Set by send-announcement-notifications (0030) once every resolved
   *  recipient has been processed for the push channel. Null does not
   *  necessarily mean "not sent" — an in_app-only/email-only announcement
   *  is marked delivered immediately since there's no push to wait on. */
  delivered_at: string | null;
  estimated_recipient_count: number | null;
  created_at: string;
}

/** `scheduled_job_runs` table (migration 0010) — one row per Edge Function
 *  execution. Real job_name values currently in use: see MONITORED_JOBS in
 *  apps/admin's services-health route (send_impersonation_notifications,
 *  send_digest_notifications, send_announcement_notifications) — job_name
 *  has no DB-level CHECK constraint, so this type doesn't enumerate it as
 *  a union; a new cron-invoked Edge Function can start writing a new name
 *  without a migration or a type change here. */
export interface ScheduledJobRun {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed';
  error_message: string | null;
  retry_count: number;
}

/** Return shape of admin_storage_usage_by_org() (migration 0026) joined
 *  against `organizations`, with overage_status added this session (Doc
 *  00 §0.3 item 7's free-tier thresholds — see apps/admin's storage route
 *  for the actual byte cutoffs). 'no_limit_defined' covers any plan other
 *  than 'free', since no numeric limit is defined for those anywhere in
 *  Doc 00/03 — not a value to treat as "no problem", just "not checked". */
export interface OrgStorageUsage {
  organization_id: string;
  organization_name: string;
  plan: string | null;
  suspended_at: string | null;
  deleted_at: string | null;
  file_count: number;
  total_bytes: number;
  overage_status: 'ok' | 'warning' | 'critical' | 'over_limit' | 'no_limit_defined';
}

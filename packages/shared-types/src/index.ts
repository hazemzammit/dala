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
  emergency_contact_name: string | null; // migration 0075 — Phase 10 §4.3
  emergency_contact_phone: string | null; // migration 0075 — Phase 10 §4.3
}

/** migration 0075, Part 5 — the jsonb shape `get_profile_summary_for_org_member()`
 *  returns: an org-scoped read of another member's profile, deliberately
 *  narrower than the full `Profile` row (see that RPC's own comment —
 *  never the full row, never auth.users.email itself). */
export interface ProfileSummary {
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  email_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
  profile_checklist_dismissed_at: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
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

// migration 0075 — Phase 10 §4.2. Closed enums enforced by real CHECK
// constraints on organizations.legal_form/workforce_size_bracket, which is
// exactly why organization-settings.tsx uses a small local chip-row
// control for these two instead of the free-text-fallback Select.tsx (see
// that screen's own header for the reasoning).
export type OrganizationLegalForm = 'personne_physique' | 'sarl' | 'suarl' | 'sa';
export type WorkforceSizeBracket = '1' | '2_10' | '11_50' | '51_plus';
export type OrganizationVerificationStatus = 'unverified' | 'pending' | 'verified';

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
  legal_form: OrganizationLegalForm | null; // migration 0075 — Phase 10 §4.2
  workforce_size_bracket: WorkforceSizeBracket | null; // migration 0075 — Phase 10 §4.2, superseded for display by a live worker count once any exist (see organization-settings.tsx)
  facebook_url: string | null; // migration 0075
  instagram_url: string | null; // migration 0075
  website_url: string | null; // migration 0075
  service_area: string | null; // migration 0075 — free text ("zone d'intervention"), not geocoded
  verification_status: OrganizationVerificationStatus; // migration 0075 — display-only in this phase, no self-service write path
  // rib_encrypted/rib_last4 deliberately NOT modeled here — the ciphertext
  // column is never selected by any client (see get_organization_rib_masked,
  // migration 0075), and rib_last4 is read only through that RPC's own
  // { has_rib, rib_last4 } shape, not as a plain organizations column read.
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
  photo_url: string | null; // migration 0070 — Phase 3 §1.5, storage path (never a direct URL — Doc 01 §1.3.11)
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

// migration 0030 — Doc 03 §3.22 invite-by-email pipeline for
// organization_members (manager/viewer only, never 'owner' — see 0030's
// header for why ownership transfer isn't part of this pipeline). Added
// here in Phase 10; the table/RPCs shipped in Phase 9 without a shared
// type, so team-members.tsx was carrying its own local interface.
export interface OrganizationMemberInvitation {
  id: string;
  org_id: string;
  invited_email: string;
  role: Extract<OrgRole, 'manager' | 'viewer'>;
  token: string;
  status: InvitationStatus;
  created_by: string;
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
  cover_photo_url: string | null; // migration 0070 — Phase 3 §1.5, storage path (never a direct URL — Doc 01 §1.3.11)
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
  // migration 0046 — Doc 01 §1.9 optimistic concurrency. Same mechanism as
  // DispatchAssignment.version/Project.version (both migration 0006) —
  // vehicles was the one editable-record table §1.9 names that was
  // missing this column until this migration closed that gap.
  version: number;
  photo_url: string | null; // migration 0070 — Phase 3 §1.3 item 1, storage path (never a direct URL — Doc 01 §1.3.11)
  // migration 0076 — Phase 11 §9.2, 30-day recoverable soft-delete.
  deleted_at: string | null;
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
  // migration 0045 — Doc 03 §3.3/§3.9 offline sync watermark (Phase 17).
  updated_at: string;
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
  // migration 0045 — Doc 03 §3.3/§3.9 offline sync watermark (Phase 17).
  updated_at: string;
  // migration 0071 — Phase 4 §1.1 step 4 / §3, optional context for an
  // 'absent' status, storage path N/A (plain text, not a photo field).
  absence_reason: string | null;
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
  // migration 0045 — Doc 03 §3.3/§3.9 offline sync watermark (Phase 17).
  updated_at: string;
  // migration 0090 — Doc 05 §1.7c Tier 3. The MANAGER's reason for
  // approving/rejecting, distinct from `reason` above (the worker's own
  // stated reason for requesting the advance, set at creation). Null for
  // any row approved/rejected before this migration.
  manager_reason: string | null;
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
  // migration 0076 — Phase 11 §9.2, soft-delete backing the UndoToast's
  // undo window on expenses.tsx. See that migration's own Part 2 header
  // for why this is deliberately NOT wired into trash.tsx.
  deleted_at: string | null;
}

/**
 * migration 0034 — Doc 03 §3.10.2 Équipe tab. Durable per-project staffing
 * roster, distinct from `DispatchAssignment` (scheduling) — see that
 * migration's header for why the two are separate concepts. Auto-seeded
 * from dispatch assignments (`added_by` is then the user who created the
 * dispatch assignment, not necessarily who's viewing the roster), also
 * directly manageable via the Équipe screen. `removed_at`/`removed_by` are
 * a soft-delete pair, not a hard row delete — a worker "removed" from a
 * project keeps their historical row.
 */
export interface ProjectWorker {
  id: string;
  project_id: string;
  worker_id: string;
  org_id: string;
  added_at: string;
  added_by: string | null;
  removed_at: string | null;
  removed_by: string | null;
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
  // migration 0090 — Doc 05 §1.7c Tier 3. The manager's reason for marking
  // this cycle as paid. Null for any cycle marked paid before this
  // migration.
  paid_reason: string | null;
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
  // migration 0045 — Doc 03 §3.3/§3.9 offline sync watermark (Phase 17).
  updated_at: string;
  // migration 0073 — improvement-plan §1.9 item 2. Optional; when set
  // alongside project_id, approving the request pushes a matching
  // project_expenses row (category='materiaux'). See approve_material_request().
  cost: number | null;
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
  // migration 0045 — Doc 03 §3.3/§3.9 offline sync watermark (Phase 17).
  updated_at: string;
  // migration 0072 — improvement-plan Phase 6 (§1.2 step 4), 30-day
  // recoverable soft-delete. Set only via soft_delete_site_log()/
  // restore_site_log(); read here since journal.tsx queries this table
  // live from Supabase and filters `.is('deleted_at', null)` client-side.
  // Deliberately NOT mirrored onto the local WatermelonDB SiteLog model —
  // see 0072's own migration header for why the two diverge.
  deleted_at: string | null;
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
  // migration 0071 — Phase 4 §3, closed list at the app layer so the
  // future §2.3 safety chart can group by category; nullable at the DB
  // layer only for pre-migration rows.
  incident_type: string | null;
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
  // Phase 11 §9.2 — 'vehicle'/'site_log' added, extending trash/restore
  // coverage per that section's own wording.
  entity_type: 'project' | 'worker' | 'vehicle' | 'site_log';
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

/** `edge_function_invocations` table (migration 0057) — one row per
 *  invocation of a user-triggered (not cron-invoked) Edge Function, written
 *  by supabase/functions/_shared/logInvocation.ts's wrapper. Distinct from
 *  ScheduledJobRun above: that table only ever gets a row from a pg_cron
 *  tick; this one only ever gets a row from a synchronous, user-triggered
 *  call (send-organization-invitation-email, generate-report, etc — see
 *  0057's header for the full retrofitted list). function_name has no
 *  DB-level CHECK constraint, same reasoning as ScheduledJobRun's
 *  job_name — a newly-retrofitted function can start writing a new name
 *  without a migration or a type change here. */
export interface EdgeFunctionInvocation {
  id: string;
  function_name: string;
  status: 'success' | 'error';
  duration_ms: number | null;
  error_message: string | null;
  org_id: string | null;
  invoked_at: string;
}

// ---------------------------------------------------------------------------
// Phase 8 (improvement-plan §1.7, §1.3 steps 2-3) — migration 0073
// ---------------------------------------------------------------------------

/** `org_activity_feed` (migration 0073) — improvement-plan §1.7. Populated
 *  only by AFTER INSERT triggers on site_logs/project_expenses/
 *  safety_incidents/dispatch_assignments; see that migration's own header
 *  for why this is a dedicated table rather than RLS on audit_log.
 *  `actor_id` is null for a 'dispatch_assigned' row (dispatch_assignments
 *  has no "created by" column) — display code should fall back to a
 *  generic "L'équipe" label for that one event type, same pattern
 *  journal.tsx's loggedByName() already uses for an unresolved author. */
export interface OrgActivityEvent {
  id: string;
  org_id: string;
  event_type:
    'site_log_added' | 'expense_recorded' | 'safety_incident_reported' | 'dispatch_assigned';
  actor_id: string | null;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** `vehicle_maintenance_log` (migration 0073) — improvement-plan §1.3 step
 *  2. Append-only, owner/manager-insert only — see that migration's Part 3
 *  header for why this and VehicleDocument below are both append-only. */
export interface VehicleMaintenanceLogEntry {
  id: string;
  org_id: string;
  vehicle_id: string;
  log_date: string;
  description: string;
  cost: number | null;
  logged_by: string | null;
  created_at: string;
}

/** `vehicle_documents` (migration 0073) — improvement-plan §1.3 step 3.
 *  Append-only, one row per recording; the currently-relevant document of
 *  a given `document_type` for a vehicle is the most recent row for that
 *  (vehicle_id, document_type) pair — resolve with DISTINCT ON at query
 *  time, never assume the only row or the first row is current. */
export interface VehicleDocument {
  id: string;
  org_id: string;
  vehicle_id: string;
  document_type: string;
  document_url: string | null;
  expires_at: string;
  recorded_by: string | null;
  created_at: string;
}

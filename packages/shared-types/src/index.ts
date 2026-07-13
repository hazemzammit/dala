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
export type VehicleStatus = 'available' | 'in_use' | 'maintenance';
export type InvitationChannel = 'app' | 'whatsapp' | 'sms';
export type InvitationStatus = 'pending' | 'accepted' | 'expired';
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
  created_at: string;
  last_login_at: string | null;
  last_login_platform: Platform | null;
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
  phone: string | null;
  trade: string | null;
  daily_rate: number | null;
  user_id: string | null;
  created_at: string;
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
  created_at: string;
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
  created_at: string;
}

export interface SiteLog {
  id: string;
  org_id: string;
  project_id: string;
  photo_url: string;
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
  photo_url: string | null;
  reported_by: string | null;
  created_at: string;
}

export interface OrgInsurance {
  id: string;
  org_id: string;
  provider_name: string;
  policy_number: string | null;
  document_url: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface PlatformAdmin {
  id: string;
  full_name: string;
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

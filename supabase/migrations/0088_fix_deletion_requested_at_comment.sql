-- =============================================================================
-- 0088_fix_deletion_requested_at_comment.sql
-- Audit finding 5 — 0028's comment on profiles.deletion_requested_at claims
-- "the new delete-account Edge Function (service-role) polls/consumes this
-- to actually call auth.admin.deleteUser." That's the opposite of what
-- delete-account/index.ts's own header says and does: deliberately
-- synchronous/immediate, called directly by delete-account.tsx right after
-- request_account_deletion() succeeds — never polled. Purely a stale doc
-- comment; the feature itself works correctly either way. Comments can be
-- re-issued without touching the column, so no table/data change here.
-- =============================================================================

comment on column profiles.deletion_requested_at is
  'Doc 03 §3.22 account deletion. Set by request_account_deletion(); consumed
   synchronously by the delete-account Edge Function, called directly by the
   client (delete-account.tsx) right after request_account_deletion()
   succeeds — not polled. (Corrects 0028''s original comment, which claimed
   a polling design; delete-account/index.ts has always been deliberately
   synchronous/immediate, per its own header.)';

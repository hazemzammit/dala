-- =============================================================================
-- 0087_advances_notification_trigger.sql
-- Audit finding 3a — the `advances` push toggle (profiles.notification_prefs
-- .advances, default true, 0025) is real and user-facing on both platforms
-- (notification-settings.tsx / NotificationsForm.tsx), but 0074 only ever
-- wired dispatch/materials/safety triggers — nothing fires on an advance
-- request's status change, so the toggle has been a silent no-op since it
-- shipped.
--
-- RECIPIENT DIRECTION — checked advances' own schema (0007) before writing
-- this rather than treating it as open: `status` moves
-- pending -> approved/rejected, and the table has both `requested_by` and
-- `approved_by`. Unlike materials/safety (which notify owners/managers
-- about something a worker/trade just submitted, because that's who needs
-- to act on it), the approver here already sees the pending request live
-- in their own queue — the person who's actually left waiting on a
-- decision is the requester. So this notifies requested_by on the
-- pending -> approved/rejected transition, not owners/managers.
-- =============================================================================

create or replace function notify_advance_decision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_prefs jsonb;
begin
  -- Only fire on an actual pending -> approved/rejected transition, not
  -- every update to the row.
  if new.status = old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  if new.requested_by is null then
    return new;
  end if;

  select p.expo_push_token, p.notification_prefs
    into v_token, v_prefs
  from profiles p
  where p.id = new.requested_by;

  -- No push token yet, or the advances category is toggled off — quiet
  -- no-op, same shape as every other "not a recipient" branch in 0074.
  if v_token is null then
    return new;
  end if;
  if coalesce((v_prefs->>'advances')::boolean, true) is not true then
    return new;
  end if;

  perform send_expo_push(
    v_token,
    case
      when new.status = 'approved' then 'Avance approuvée'
      else 'Avance refusée'
    end,
    case
      when new.status = 'approved' then 'Votre demande d''avance de ' || new.amount || ' TND a été approuvée.'
      else 'Votre demande d''avance de ' || new.amount || ' TND a été refusée.'
    end,
    jsonb_build_object('type', 'advance', 'id', new.id)
  );
  return new;
end;
$$;
revoke execute on function notify_advance_decision() from public, anon, authenticated;

create trigger advances_notify_decision
  after update on advances
  for each row execute function notify_advance_decision();

comment on function notify_advance_decision() is
  'Audit fix 3a — profiles.notification_prefs.advances (0025) had a real
   UI toggle on both platforms but no trigger ever checked it (0074 wired
   dispatch/materials/safety only). Fires on the advances.status
   pending -> approved/rejected transition, notifying requested_by — the
   approver already sees the pending item live in their own queue, so no
   approver-side push is needed here, unlike materials/safety''s
   owner/manager fan-out.';

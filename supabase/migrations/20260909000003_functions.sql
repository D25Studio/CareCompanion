-- Care Companion: RPC functions
-- These run as security definer so business rules are enforced in one place.

-- ---------------------------------------------------------------------------
-- create_pairing_code(): called by the Companion app (anonymous patient user).
-- Creates the patient's circle if needed and issues a fresh 6-digit code.
-- ---------------------------------------------------------------------------
create or replace function public.create_pairing_code()
returns table (circle_id uuid, pairing_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_circle_id uuid;
  v_code text;
  v_expires timestamptz := now() + interval '30 minutes';
  v_attempts integer := 0;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'Not signed in';
  end if;
  if v_profile.role <> 'patient' then
    raise exception 'Only a patient device can create a pairing code';
  end if;

  select id into v_circle_id from public.care_circles where patient_id = auth.uid();
  if v_circle_id is null then
    insert into public.care_circles (patient_id) values (auth.uid()) returning id into v_circle_id;
  end if;

  -- Generate a unique 6-digit code. Collisions are rare; retry a few times.
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.care_circles c where c.pairing_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'Could not generate a pairing code, please try again';
    end if;
  end loop;

  update public.care_circles
  set pairing_code = v_code, pairing_code_expires_at = v_expires
  where id = v_circle_id;

  return query select v_circle_id, v_code, v_expires;
end;
$$;

grant execute on function public.create_pairing_code() to authenticated;

-- ---------------------------------------------------------------------------
-- redeem_pairing_code(): called by a caregiver. First redeemer becomes owner.
-- Later redeemers (invited by the owner sharing a fresh code) join as members.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_pairing_code(
  p_code text,
  p_relationship_label text,
  p_circle_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_circle public.care_circles%rowtype;
  v_is_first boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'Not signed in';
  end if;
  if v_profile.role <> 'caregiver' then
    raise exception 'Only a caregiver account can redeem a pairing code';
  end if;
  if coalesce(trim(p_relationship_label), '') = '' then
    raise exception 'A relationship label is required (for example "wife" or "son")';
  end if;

  select * into v_circle
  from public.care_circles
  where pairing_code = trim(p_code)
    and pairing_code_expires_at > now();

  if v_circle.id is null then
    raise exception 'That code is not valid or has expired. Ask for a new code on the patient phone.';
  end if;

  v_is_first := v_circle.owner_id is null;

  insert into public.care_circle_members (circle_id, caregiver_id, relationship_label, is_owner)
  values (v_circle.id, auth.uid(), trim(p_relationship_label), v_is_first)
  on conflict (circle_id, caregiver_id) do update
    set relationship_label = excluded.relationship_label;

  update public.care_circles
  set owner_id = coalesce(owner_id, auth.uid()),
      name = coalesce(nullif(trim(p_circle_name), ''), name),
      paired_at = coalesce(paired_at, now()),
      pairing_code = null,
      pairing_code_expires_at = null
  where id = v_circle.id;

  return v_circle.id;
end;
$$;

grant execute on function public.redeem_pairing_code(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- respond_to_contact_request(): caregiver accepts or declines. Enforces the
-- state machine: only the targeted member may respond, only while pending.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_contact_request(
  p_request_id uuid,
  p_action text,
  p_reason_key text default null,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.contact_requests%rowtype;
  v_member public.care_circle_members%rowtype;
begin
  select * into v_request from public.contact_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'Request not found';
  end if;

  select * into v_member from public.care_circle_members where id = v_request.target_member_id;
  if v_member.caregiver_id <> auth.uid() and not public.is_circle_owner(v_request.circle_id) then
    raise exception 'You are not the person this request was sent to';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This request has already been answered (%).', v_request.status;
  end if;

  if p_action = 'accept' then
    update public.contact_requests
    set status = 'accepted', responded_at = now()
    where id = p_request_id;
  elsif p_action = 'decline' then
    update public.contact_requests
    set status = 'declined',
        responded_at = now(),
        decline_reason_key = nullif(trim(coalesce(p_reason_key, '')), ''),
        decline_message = nullif(trim(coalesce(p_message, '')), '')
    where id = p_request_id;
  else
    raise exception 'Action must be "accept" or "decline"';
  end if;
end;
$$;

grant execute on function public.respond_to_contact_request(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- expire_stale_contact_requests(): safety net run by pg_cron every minute so a
-- request never stays pending forever if the agent process died.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_contact_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.contact_requests
    set status = 'expired', ended_at = now()
    where status in ('pending', 'accepted')
      and expires_at < now() - interval '2 minutes'
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- register_push_token(): upsert helper for the caregiver app
-- ---------------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_tokens (profile_id, expo_push_token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (profile_id, expo_push_token) do update
    set platform = excluded.platform, updated_at = now();
end;
$$;

grant execute on function public.register_push_token(text, text) to authenticated;

-- Care Companion: initial schema
-- Tables, enums, triggers. RLS policies live in the next migration.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (keep in sync with packages/shared/src/constants.ts)
-- ---------------------------------------------------------------------------
create type public.profile_role as enum ('patient', 'caregiver');

create type public.dementia_condition as enum (
  'alzheimers', 'vascular', 'lewy_body', 'frontotemporal', 'mixed', 'unspecified'
);

create type public.dementia_stage as enum ('early', 'middle', 'late', 'unspecified');

create type public.contact_request_status as enum (
  'pending', 'accepted', 'declined', 'expired', 'connected', 'ended'
);

create type public.conversation_event_type as enum (
  'user_said', 'assistant_said', 'tool_call', 'escalation', 'session_note'
);

create type public.distress_level as enum ('low', 'medium', 'high');

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.profile_role not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Patients are anonymous auth users created by the Companion app.';

-- Auto-create a profile when a user signs up. Role and name come from auth metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.profile_role, 'caregiver'),
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- care_circles: one per patient
-- ---------------------------------------------------------------------------
create table public.care_circles (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null default 'My care circle',
  pairing_code text,
  pairing_code_expires_at timestamptz,
  paired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint care_circles_patient_unique unique (patient_id)
);

create unique index care_circles_pairing_code_idx
  on public.care_circles (pairing_code)
  where pairing_code is not null;

-- ---------------------------------------------------------------------------
-- care_circle_members: caregivers in a circle
-- ---------------------------------------------------------------------------
create table public.care_circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,
  relationship_label text not null,
  is_owner boolean not null default false,
  can_receive_calls boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  constraint care_circle_members_unique unique (circle_id, caregiver_id)
);

create index care_circle_members_caregiver_idx on public.care_circle_members (caregiver_id);

-- ---------------------------------------------------------------------------
-- patient_settings: caregiver-controlled behaviour for the assistant
-- ---------------------------------------------------------------------------
create table public.patient_settings (
  circle_id uuid primary key references public.care_circles (id) on delete cascade,
  preferred_name text not null default '',
  condition public.dementia_condition not null default 'unspecified',
  stage public.dementia_stage not null default 'unspecified',
  assistant_name text not null default 'Companion',
  assistant_voice text not null default 'marin',
  speaking_rate numeric(3,2) not null default 0.90 check (speaking_rate between 0.5 and 1.2),
  orientation_facts jsonb not null default '{}'::jsonb,
  custom_guidance text,
  unavailable_responses jsonb not null default '{}'::jsonb,
  no_answer_message text,
  request_timeout_seconds integer not null default 90 check (request_timeout_seconds between 30 and 600),
  store_transcripts boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger patient_settings_touch
  before update on public.patient_settings
  for each row execute function public.touch_updated_at();

-- Every circle gets a settings row automatically.
create or replace function public.create_default_patient_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.patient_settings (circle_id) values (new.id)
  on conflict (circle_id) do nothing;
  return new;
end;
$$;

create trigger care_circles_default_settings
  after insert on public.care_circles
  for each row execute function public.create_default_patient_settings();

-- ---------------------------------------------------------------------------
-- contact_requests: patient asks to reach a caregiver
-- ---------------------------------------------------------------------------
create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  target_member_id uuid not null references public.care_circle_members (id) on delete cascade,
  status public.contact_request_status not null default 'pending',
  decline_reason_key text,
  decline_message text,
  livekit_room text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz
);

create index contact_requests_circle_created_idx on public.contact_requests (circle_id, created_at desc);
create index contact_requests_pending_idx on public.contact_requests (status, expires_at) where status in ('pending', 'accepted');

-- ---------------------------------------------------------------------------
-- conversation_sessions / conversation_events
-- ---------------------------------------------------------------------------
create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  livekit_room text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  mood_estimate text,
  distress_flagged boolean not null default false,
  summary text
);

create index conversation_sessions_circle_started_idx on public.conversation_sessions (circle_id, started_at desc);

create table public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.conversation_sessions (id) on delete cascade,
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  type public.conversation_event_type not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index conversation_events_session_idx on public.conversation_events (session_id, created_at);
create index conversation_events_circle_created_idx on public.conversation_events (circle_id, created_at desc);

-- ---------------------------------------------------------------------------
-- daily_summaries
-- ---------------------------------------------------------------------------
create table public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  summary_date date not null,
  summary_text text not null,
  request_count integer not null default 0,
  session_count integer not null default 0,
  flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint daily_summaries_unique unique (circle_id, summary_date)
);

-- ---------------------------------------------------------------------------
-- alerts: urgent escalations feed
-- ---------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  session_id uuid references public.conversation_sessions (id) on delete set null,
  level public.distress_level not null,
  note text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id) on delete set null
);

create index alerts_circle_created_idx on public.alerts (circle_id, created_at desc);

-- ---------------------------------------------------------------------------
-- push_tokens
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  constraint push_tokens_unique unique (profile_id, expo_push_token)
);

-- ---------------------------------------------------------------------------
-- Realtime: caregiver app and voice agent subscribe to these
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.contact_requests;
alter publication supabase_realtime add table public.care_circles;
alter publication supabase_realtime add table public.alerts;
alter publication supabase_realtime add table public.daily_summaries;

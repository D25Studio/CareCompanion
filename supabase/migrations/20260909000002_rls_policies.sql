-- Care Companion: Row Level Security
-- Principle: patients see only their own circle; caregivers see circles they belong to;
-- only owners change settings and membership. The voice agent and Edge Functions use
-- the service role and bypass RLS.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read membership under RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_circle_members m
    where m.circle_id = p_circle_id and m.caregiver_id = auth.uid()
  );
$$;

create or replace function public.is_circle_owner(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_circle_members m
    where m.circle_id = p_circle_id and m.caregiver_id = auth.uid() and m.is_owner
  );
$$;

create or replace function public.is_circle_patient(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_circles c
    where c.id = p_circle_id and c.patient_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

-- Caregivers can see display names of other members in their circles, and of the patient.
create policy "profiles: read circle peers"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.care_circle_members mine
      join public.care_circle_members theirs on theirs.circle_id = mine.circle_id
      where mine.caregiver_id = auth.uid() and theirs.caregiver_id = profiles.id
    )
    or exists (
      select 1
      from public.care_circle_members mine
      join public.care_circles c on c.id = mine.circle_id
      where mine.caregiver_id = auth.uid() and c.patient_id = profiles.id
    )
  );

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- care_circles
-- ---------------------------------------------------------------------------
alter table public.care_circles enable row level security;

create policy "circles: patient reads own"
  on public.care_circles for select
  using (patient_id = auth.uid());

create policy "circles: members read"
  on public.care_circles for select
  using (public.is_circle_member(id));

create policy "circles: owner updates name"
  on public.care_circles for update
  using (public.is_circle_owner(id))
  with check (public.is_circle_owner(id));

-- Inserts happen only through create_pairing_code() (security definer).

-- ---------------------------------------------------------------------------
-- care_circle_members
-- ---------------------------------------------------------------------------
alter table public.care_circle_members enable row level security;

create policy "members: members and patient read"
  on public.care_circle_members for select
  using (public.is_circle_member(circle_id) or public.is_circle_patient(circle_id));

create policy "members: owner inserts"
  on public.care_circle_members for insert
  with check (public.is_circle_owner(circle_id));

create policy "members: owner updates"
  on public.care_circle_members for update
  using (public.is_circle_owner(circle_id))
  with check (public.is_circle_owner(circle_id));

create policy "members: owner deletes non-owners"
  on public.care_circle_members for delete
  using (public.is_circle_owner(circle_id) and not is_owner);

-- ---------------------------------------------------------------------------
-- patient_settings
-- ---------------------------------------------------------------------------
alter table public.patient_settings enable row level security;

create policy "settings: members and patient read"
  on public.patient_settings for select
  using (public.is_circle_member(circle_id) or public.is_circle_patient(circle_id));

create policy "settings: owner updates"
  on public.patient_settings for update
  using (public.is_circle_owner(circle_id))
  with check (public.is_circle_owner(circle_id));

-- ---------------------------------------------------------------------------
-- contact_requests
-- ---------------------------------------------------------------------------
alter table public.contact_requests enable row level security;

create policy "requests: members and patient read"
  on public.contact_requests for select
  using (public.is_circle_member(circle_id) or public.is_circle_patient(circle_id));

-- Caregivers respond via respond_to_contact_request() (security definer) so the
-- state machine is enforced server-side. No direct update policy.

-- ---------------------------------------------------------------------------
-- conversation_sessions / conversation_events
-- ---------------------------------------------------------------------------
alter table public.conversation_sessions enable row level security;

create policy "sessions: members read"
  on public.conversation_sessions for select
  using (public.is_circle_member(circle_id));

alter table public.conversation_events enable row level security;

create policy "events: members read"
  on public.conversation_events for select
  using (public.is_circle_member(circle_id));

-- ---------------------------------------------------------------------------
-- daily_summaries
-- ---------------------------------------------------------------------------
alter table public.daily_summaries enable row level security;

create policy "summaries: members read"
  on public.daily_summaries for select
  using (public.is_circle_member(circle_id));

-- ---------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------
alter table public.alerts enable row level security;

create policy "alerts: members read"
  on public.alerts for select
  using (public.is_circle_member(circle_id));

create policy "alerts: members acknowledge"
  on public.alerts for update
  using (public.is_circle_member(circle_id))
  with check (public.is_circle_member(circle_id));

-- ---------------------------------------------------------------------------
-- push_tokens
-- ---------------------------------------------------------------------------
alter table public.push_tokens enable row level security;

create policy "push tokens: own"
  on public.push_tokens for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

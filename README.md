# Care Companion

A two-app system that helps a person living with dementia use their phone to reach family, and keeps them calm and company in between.

- **Companion** (`apps/companion`) — the patient's app. One screen. It listens, talks back in real time, and connects family calls. No settings, no navigation.
- **Caregiver** (`apps/caregiver`) — the family's app. Pair the phone, manage who can be reached, tune how the helper talks, answer contact requests with one tap, read daily summaries and alerts.
- **Voice agent** (`services/voice-agent`) — a LiveKit Agents worker driving OpenAI Realtime with a dementia-communication prompt and four tools: `request_contact`, `get_orientation_info`, `flag_distress`, `end_conversation`.
- **Supabase** (`supabase/`) — Postgres with RLS on every table, Auth, Realtime, three Edge Functions (`livekit-token`, `notify-request`, `generate-daily-summary`) and pg_cron jobs.
- **Shared** (`packages/shared`) — DB types, zod schemas, constants, prompt templates, request state machine, data-channel message types. Used by both apps and the agent.

See `AGENTS.md` for the code map and conventions, and `docs/handoff/` for step-by-step verification tasks designed to be run one per agent session.

## How it works

```
Patient says "I want to talk to my wife"
  -> agent calls request_contact("wife")
  -> contact_requests row (pending) + push to Sarah's phone
  -> agent keeps the patient company (non-blocking tool)
  -> Sarah taps "Call now"        -> row = accepted -> agent says "Sarah is coming on the line"
                                     -> Sarah joins the LiveKit room -> agent mutes -> patient sees Call screen
     Sarah taps "At work"          -> row = declined -> agent speaks Sarah's preset message, redirects gently
     nobody answers within 90 s    -> row = expired  -> agent speaks the no-answer message, redirects gently
  -> every session is logged; a nightly summary goes to the family
```

## Prerequisites

| Tool | Why | Install (Windows) |
|---|---|---|
| Node 20+ | everything | already present |
| pnpm 10+ | workspace package manager | `npm i -g pnpm` |
| Supabase CLI | migrations, Edge Functions | `scoop install supabase` or use `npx supabase` |
| EAS CLI | dev builds (LiveKit needs a dev build, not Expo Go) | `npm i -g eas-cli` |
| LiveKit CLI (optional) | deploy the agent to LiveKit Cloud | `winget install LiveKit.LiveKitCLI` |
| Android Studio (optional) | local Android dev builds | https://developer.android.com/studio |

Accounts and keys you need: a **Supabase** project, a **LiveKit Cloud** project, an **OpenAI** API key, and an **Expo** account. Copy `.env.example` and fill it in; each part of the repo reads a subset (see the comments at the top of that file).

`scripts/setup-tools.ps1` installs the CLIs; `scripts/check.ps1` runs install + typecheck + tests.

## Set up in order

### 1. Install and verify the code

```powershell
pnpm install
pnpm -r typecheck
pnpm test
```

### 2. Supabase

1. Create a hosted project. In **Authentication > Providers** enable **Anonymous sign-ins** (the patient phone uses them) and **Email**.
2. Link and push the schema, then deploy the functions:

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase secrets set LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... LIVEKIT_AGENT_NAME=care-companion OPENAI_API_KEY=... SUMMARY_MODEL=gpt-5-mini SUMMARY_TIMEZONE=Australia/Sydney
npx supabase functions deploy livekit-token
npx supabase functions deploy notify-request --no-verify-jwt
npx supabase functions deploy generate-daily-summary --no-verify-jwt
```

   `scripts/supabase-deploy.ps1` does all of this from a filled-in `.env`.

3. For the nightly summary cron, store two Vault secrets once (SQL editor):

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

### 3. Voice agent

```powershell
cd services/voice-agent
copy .env.example .env.local   # fill in
pnpm dev                       # registers with LiveKit Cloud as agent "care-companion"
```

`pnpm console` lets you talk to the agent from the terminal with default settings (no phone needed). Deploy with `lk agent create` from `services/voice-agent`, or with the `Dockerfile` on Fly.io / Railway.

### 4. Mobile apps (dev builds)

Both apps need native code (WebRTC), so use EAS dev builds or `expo run:android`.

```powershell
cd apps/caregiver
copy .env.example .env         # EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
eas init                       # sets EAS_PROJECT_ID; put it in your shell as EAS_PROJECT_ID_CAREGIVER
eas build --profile development --platform android
pnpm start

cd ../companion
copy .env.example .env
eas init                       # EAS_PROJECT_ID_COMPANION
eas build --profile development --platform android
pnpm start
```

On Windows, iOS builds go through EAS cloud (`--platform ios`). Android push notifications additionally need a Firebase project: drop `google-services.json` into `apps/caregiver/` (git-ignored) and rebuild.

### 5. First run

1. Open **Caregiver**, create an account (your first name is what the helper says: "Sarah is at work").
2. Open **Companion** on the patient's phone. It shows a 6-digit code.
3. In Caregiver, enter the code, your relationship word ("wife") and the patient's preferred name.
4. The patient's phone starts talking within a few seconds. Say "I want to talk to my wife" to test the full loop.
5. In Caregiver > Settings, set condition, orientation facts, guidance and the per-reason messages.

To add another family member later: on the patient's phone, press and hold the helper's name for five seconds to show a fresh code.

## Repository layout

```
apps/companion/         Expo Router app for the patient (one screen + pairing + call)
apps/caregiver/         Expo Router app for family (auth, pairing, requests, summaries, circle, settings)
services/voice-agent/   LiveKit Agents worker (Node, tsx)
packages/shared/        Types, schemas, constants, prompts, state machine, tests (vitest)
supabase/migrations/    Schema, RLS, RPC functions, cron
supabase/functions/     Deno Edge Functions
docs/handoff/           One self-contained task file per plan step, for fresh agent sessions
scripts/                PowerShell helpers (tool install, checks, Supabase deploy, agent dev)
```

## Privacy notes

- Row Level Security on every table; the patient sees only their own circle, caregivers only circles they belong to, and only owners can change settings and membership.
- Full transcripts are **off** by default. The agent always writes a short session note for the daily summary; the owner can enable line-by-line storage in Settings.
- Service-role keys live only in Edge Function secrets and the agent's environment, never in the apps.

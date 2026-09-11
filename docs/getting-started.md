# Getting started: from code to first test

This guide takes you from the finished code in this repo to a working test with a **Samsung S21** (the patient's phone) and **this laptop** (running the family's app in an Android emulator). Follow it top to bottom; each step says what to do and, briefly, why.

Time budget: about half a day the first time, mostly waiting for account sign-ups and builds.

---

## 0. How the pieces fit (read this first)

```
 Patient's phone                  Cloud services                     Family's phone
 ┌──────────────┐    audio     ┌──────────────┐   audio/tools    ┌──────────────┐
 │  Companion   │◄────────────►│ LiveKit room │◄────────────────►│ Voice agent  │  (Node process,
 │  (Expo app)  │              └──────────────┘                  │  OpenAI)     │   runs on laptop
 └──────┬───────┘                                                └──────┬───────┘   for now)
        │ read/write                 ┌──────────────┐                  │ read/write
        └───────────────────────────►│   Supabase   │◄─────────────────┘
                                     │ DB + Auth +  │      push
                                     │ Edge Funcs   │──────────────────► Caregiver (Expo app)
                                     └──────────────┘                    on the emulator
```

| Piece | What it is | Where in the repo |
|---|---|---|
| **Supabase** | A hosted Postgres **database** plus login (**Auth**), live change feeds (**Realtime**) and small server programs (**Edge Functions**). It is the shared memory of the whole system. | `supabase/` |
| **LiveKit Cloud** | Hosts the "rooms" where audio flows. A room is like a phone line; participants join it with a **token**. | tokens minted in `supabase/functions/livekit-token` |
| **Voice agent** | A Node program that joins the patient's room, listens, and speaks using OpenAI's realtime model. It reads the family's settings from Supabase. | `services/voice-agent/` |
| **Companion / Caregiver** | Two React Native apps built with **Expo**. They talk to Supabase directly and to LiveKit through tokens. | `apps/companion`, `apps/caregiver` |
| **Shared package** | Types, constants and prompt text used by everything above, so they never disagree. | `packages/shared/` |

Two ideas you will meet repeatedly:

- **Environment variables (`.env` files)** hold URLs and secret keys. The code reads them at start-up so secrets never live in source code. Each part of the repo has its own `.env.example` listing what it needs; you copy it and fill it in.
- **Migrations** are numbered SQL files in `supabase/migrations/`. Running them ("pushing") builds the database tables in order. You never create tables by hand; you add a new migration.

---

## 1. Install the tools on the laptop

Open **PowerShell** and run:

```powershell
cd c:\Tyler\Projects\Workspaces\care-companion
.\scripts\setup-tools.ps1
```

This installs `pnpm` (package manager), `eas-cli` (Expo builds) and, if possible, the Supabase and LiveKit CLIs. If PowerShell refuses to run scripts, first run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Then confirm the code is healthy:

```powershell
.\scripts\check.ps1
```

You should see "All checks passed." This means the TypeScript compiles and the 45 automated tests pass. Run it again any time you change code.

---

## 2. Create the four accounts

You need one account with each service. All have free tiers sufficient for testing.

| Service | Sign up at | What you take away |
|---|---|---|
| Supabase | https://supabase.com | Project URL, `anon` key, `service_role` key |
| LiveKit Cloud | https://cloud.livekit.io | WebSocket URL (`wss://…livekit.cloud`), API key, API secret |
| OpenAI | https://platform.openai.com | API key (add a small amount of credit under Billing) |
| Expo | https://expo.dev | Login for `eas` builds |

**Key hygiene:** the `anon` key is safe to ship inside apps (the database's security rules limit what it can do). The `service_role` key bypasses all rules — it goes only in the agent's `.env.local` and in Supabase secrets, never in an app.

---

## 3. Set up Supabase (the database)

### 3.1 Create the project
1. In the Supabase dashboard click **New project**. Pick a region near you (Sydney). Save the database password somewhere.
2. Go to **Project Settings → API**. Copy the **Project URL**, the **anon public** key and the **service_role** key.
URL: https://supabase.com/dashboard/project/pbwpnuzpmfkdlrkpaxks
Anon: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBid3BudXpwbWZrZGxya3BheGtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwODkwNDQsImV4cCI6MjEwNDY2NTA0NH0.g7c0nYLMWAWQ2ZvSfvVoybrp8l_8Kkxe6jHjxm6PIqs
service_role: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBid3BudXpwbWZrZGxya3BheGtzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA4OTA0NCwiZXhwIjoyMTA0NjY1MDQ0fQ.zGO9LhK6aYLpDNutxfINOcPh6JJMCvp96dAN92yat84

3. Go to **Authentication → Sign In / Providers**:
   - Enable **Anonymous sign-ins** (the patient's phone logs in without a password).
   - Under **Email**, turn **Confirm email** *off* for now so test accounts work immediately.

### 3.2 Fill in the env file
Copy `.env.example` to `.env` in the repo root and fill in every value from steps 2 and 3.1. Leave `LIVEKIT_AGENT_NAME=care-companion` as is.

### 3.3 Push the schema and deploy the functions

```powershell
npx supabase login                          # opens a browser
npx supabase link --project-ref <ref>       # <ref> is the part of your URL before .supabase.co
.\scripts\supabase-deploy.ps1
```

The script runs `db push` (creates tables, security rules, functions and scheduled jobs from `supabase/migrations/`), sets the Edge Function secrets from your `.env`, and deploys the three functions.

**What just happened:**
- Every table got **Row Level Security (RLS)** rules. A patient can only read their own circle; a family member only circles they belong to. This is why the `anon` key is safe.
- **Edge Functions** are small TypeScript programs that run on Supabase's servers. `livekit-token` hands out room tokens, `notify-request` sends push notifications, `generate-daily-summary` writes the nightly summary.
- **pg_cron** jobs were scheduled: one expires unanswered requests every minute, one triggers the summary at night.

### 3.4 Vault secrets for the nightly job
The cron job needs to call the summary function, so it must know your URL and service key. In the dashboard open **SQL Editor** and run once:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

### 3.5 Check
**Table Editor** should list `profiles`, `care_circles`, `care_circle_members`, `patient_settings`, `contact_requests`, `conversation_sessions`, `conversation_events`, `daily_summaries`, `alerts`, `push_tokens`. **Edge Functions** should list three deployed functions.

---

## 4. Set up LiveKit and the voice agent

### 4.1 LiveKit Cloud
Create a project. Under **Settings → Keys** create an API key; note the **key**, **secret** and the project's **WebSocket URL**.

### 4.2 Configure the agent

```powershell
cd services\voice-agent
copy .env.example .env.local
```

Fill in `.env.local`: LiveKit URL/key/secret, OpenAI key, Supabase URL, service role key, and `SUPABASE_FUNCTIONS_URL=https://<ref>.supabase.co/functions/v1`.

### 4.3 Talk to it from the terminal (no phone needed)

Console mode is driven by the LiveKit CLI, so install it once:

```powershell
winget install --id LiveKit.LiveKitCLI --exact
```

Open a new terminal afterwards so `lk` is on the PATH, then:

```powershell
pnpm console
```

This starts the agent in "console mode" using the laptop's microphone and speaker with default settings (no family, no patient name). There is no LiveKit room and no Supabase circle behind it, so the agent introduces itself with the fallback name. Say hello. If it answers, OpenAI and the agent are working. Press `Ctrl+C` to stop.

To type instead of talk, which is handy when you have no microphone:

```powershell
pnpm console:text
```

### 4.4 Run it for real

```powershell
pnpm dev
```

The agent now connects to LiveKit Cloud and registers as a worker named `care-companion`. It sits idle until a patient's phone opens a room, because the `livekit-token` function asks LiveKit to **dispatch** an agent with that exact name. Leave this window running whenever you test with phones.

**Why the agent runs on the laptop:** for the MVP it is just a Node process. Later it can be deployed with `lk agent create` or the `Dockerfile` so it runs 24/7.

---

## 5. Android tooling: Android Studio, emulator and the S21

### 5.1 Install Android Studio
1. Download from https://developer.android.com/studio and install with defaults (this includes the Android SDK and platform tools).
2. Open it once, go through the wizard, then **More Actions → SDK Manager** and make sure **Android SDK Platform 35** (or the latest) and **Android SDK Platform-Tools** are ticked.
3. Add two environment variables (Windows **Settings → System → About → Advanced system settings → Environment Variables**, user variables):
   - `ANDROID_HOME` = `C:\Users\tyler\AppData\Local\Android\Sdk`
   - append `%ANDROID_HOME%\platform-tools` to `Path`
4. Open a **new** PowerShell and run `adb version`. If it prints a version, the tools are on your path.

### 5.2 Create an emulator for the Caregiver app
In Android Studio: **More Actions → Virtual Device Manager → Create device**. Choose **Pixel 8**, then a system image that says **Google Play** (needed for push notifications), API 35. Finish and press ▶ to start it. Check `adb devices` lists it as `emulator-5554`.

The emulator uses the laptop's microphone and speakers, so it can take a voice call.

### 5.3 Prepare the Samsung S21 (Companion / patient phone)
1. **Settings → About phone → Software information**, tap **Build number** seven times to unlock Developer options.
2. **Settings → Developer options** → turn on **USB debugging**.
3. Plug it into the laptop, choose **Allow** on the phone. `adb devices` should now show two devices.
4. Both phone and laptop must be on the **same Wi-Fi** for the dev server to work.
5. Later, once Companion is installed: **Settings → Apps → Companion → Battery → Unrestricted**, so Android does not kill the audio session.

---

## 6. Build and install the apps

### 6.1 Why a "development build" and not Expo Go
Expo Go (the app from the Play Store) cannot load LiveKit's native audio code. So we build our own app once (a **dev client**) and install it. After that, day-to-day changes to the TypeScript load instantly over Wi-Fi without rebuilding. You only rebuild when native settings change (`app.config.ts`, new native packages).

### 6.2 Link the apps to Expo

```powershell
npm install -g eas-cli
eas login
cd apps\caregiver
eas init            # creates an Expo project and prints a projectId
cd ..\companion
eas init
```

Each `eas init` prints an ID like `2b3f…`. Paste each one into the matching `app.config.ts` as the fallback, e.g. in `apps/caregiver/app.config.ts`:

```ts
projectId: process.env.EAS_PROJECT_ID_CAREGIVER ?? '2b3f-your-id-here',
```

### 6.3 App env files
In **both** `apps/caregiver` and `apps/companion`: `copy .env.example .env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the *anon* key, not the service role). `EXPO_PUBLIC_` means Expo bundles it into the app.

### 6.4 Push notifications on Android (Caregiver only)
Expo delivers Android push through Google's Firebase. Once:
1. https://console.firebase.google.com → **Add project** → add an **Android app** with package name `com.carecompanion.caregiver`.
2. Download `google-services.json` into `apps/caregiver/` (it is git-ignored; the build picks it up automatically).
3. In Firebase **Project settings → Service accounts → Generate new private key** (a JSON file). Then run `eas credentials` in `apps/caregiver`, choose **Android → Push Notifications (FCM V1) → upload** that JSON. This lets Expo's push service talk to Firebase for you.

Skip this if you only want to test voice first; everything except the push banner still works (the request still appears in the Caregiver inbox via Realtime).

### 6.5 Build the APKs (cloud, easiest)

```powershell
cd apps\caregiver
eas build --profile development --platform android
cd ..\companion
eas build --profile development --platform android
```

Each build takes 10–20 minutes on Expo's servers and ends with a download link for an `.apk`. Download both.

*Alternative, local build (faster later, more setup now):* `pnpm android` inside an app folder runs `expo run:android` and needs **JDK 17** installed with `JAVA_HOME` set. Use it once the cloud route is working.

### 6.6 Install
```powershell
adb -s <S21 serial>   install path\to\companion.apk
adb -s emulator-5554  install path\to\caregiver.apk
```
(Get the serials from `adb devices`.) You can also just open the APK download link on the S21 in its browser.

---

## 7. Run everything and do the first test

Open **three PowerShell windows** in the repo root:

| Window | Command | What it does |
|---|---|---|
| 1 | `pnpm agent:dev` | voice agent, waiting for rooms |
| 2 | `pnpm caregiver` | dev server for the Caregiver app; press `a` to open it on the emulator |
| 3 | `pnpm companion` | dev server for Companion; scan the QR code with the S21's Companion app, or press `a` with the S21 selected |

If two dev servers clash on a port, Expo will offer another port automatically; accept it.

### 7.1 Pair the phones
1. **Emulator (Caregiver):** Sign up with your first name (the agent will say "Tyler is at work", so use a real first name), an email and password.
2. **S21 (Companion):** it signs in anonymously and shows a **6-digit code**.
3. **Emulator:** enter the code, type your relationship word (e.g. `son`), and the patient's preferred name. Tap pair.
4. Within about five seconds the S21 switches to the conversation screen and, if the agent window shows a job starting, the helper greets the patient by name.

### 7.2 Test the core scenario
1. On the S21 say: **"I want to talk to my son."**
2. The agent says it is letting you know, and keeps chatting. The emulator shows the request in the **Requests** tab (and a push banner if step 6.4 is done).
3. Tap the request. Try each path:
   - **Call now** → the emulator joins the room; the S21 shows a call screen with one big **Hang up**; the agent goes quiet. Hang up → the agent comes back and checks in.
   - **At work** (or another reason) → the agent speaks your preset message from **Settings**.
   - Ignore it for 90 s → the agent speaks the "no answer" message.
4. In **Settings** change the patient's name, condition and orientation facts, then tap the S21's **Talk to me** to restart the session and hear the difference.

`docs/verification.md` has the full checklist, including failure cases (kill the agent, turn Wi-Fi off) and accessibility checks.

### 7.3 One phone only?
Both apps can be installed on the S21 at the same time (different package names). You can test pairing, requests and declines by switching apps; a real voice call between them on a single phone is not meaningful.

---

## 8. Where to look when something fails

| Symptom | First place to look |
|---|---|
| Companion stuck on "One moment" / says it has trouble starting | Agent window (is `pnpm agent:dev` running and connected?). Then Supabase **Edge Functions → livekit-token → Logs** for token errors. |
| Companion shows the pairing code again | `care_circles` row in Table Editor: is `owner_id` set? The token function returns 409 `not_paired` when it is not. |
| Caregiver sign-up fails | **Authentication → Providers → Email**: is Confirm email off? Look at Auth logs. |
| Request never appears on the Caregiver app | `contact_requests` table: was a row inserted? If yes, Realtime issue — check **Database → Publications** includes the table. If no, the agent window shows the tool error. |
| No push banner | `push_tokens` table has a row? Firebase/FCM credentials uploaded (6.4)? Emulator image has Google Play? |
| Agent talks but ignores family settings | `patient_settings` row for the circle; agent logs print the loaded context at session start. |
| Nightly summary missing | **Integrations → Cron** shows job runs; **Edge Functions → generate-daily-summary → Logs**; Vault secrets from 3.4 set? |
| Type errors after editing | `.\scripts\check.ps1` — read the first error; the file and line are in the message. |

Useful queries in the SQL Editor:

```sql
select * from contact_requests order by created_at desc limit 10;
select * from conversation_sessions order by started_at desc limit 5;
select * from cron.job_run_details order by start_time desc limit 10;
```

---

## 9. Mental model for changing things later

- **Change what the agent says or how it behaves** → `packages/shared/src/prompts/`. Bump `PROMPT_VERSION` so old sessions stay traceable. Run `pnpm test` (prompt tests live next to the code).
- **Add a setting the family can control** → add a column in a **new** migration file (`supabase/migrations/2026…_name.sql`), add it to `database.types.ts` and `schemas.ts` in shared, show it in `apps/caregiver/app/(tabs)/settings.tsx`, read it in `services/voice-agent/src/session-context.ts`. Then `npx supabase db push`.
- **Add a new agent tool** (something the helper can *do*) → `services/voice-agent/src/tools.ts`, following `get_orientation_info` as the simplest example.
- **Add a message from the agent to the patient's screen** → define it in `packages/shared/src/data-messages.ts`, send it from the agent, handle it in `apps/companion/src/hooks/useCompanionRoom.ts`.
- **Native change** (new package with native code, permissions, icons) → edit `app.config.ts`, then rebuild the dev client (6.5). JavaScript-only changes never need a rebuild.

`AGENTS.md` lists the rules that must not be broken (room naming, request states, privacy). Read it before a bigger change.

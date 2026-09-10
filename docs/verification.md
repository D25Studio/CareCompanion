# Manual verification checklist

Run these after deploying Supabase, starting the agent (`pnpm agent:dev`) and installing dev builds of both apps. Each scenario lists the expected behaviour and where to look if it fails.

Test devices: one phone for **Companion** (the patient), one for **Caregiver**. A second caregiver account is useful for the multi-member scenarios.

## 1. Pairing

| Step | Expected | If it fails |
|---|---|---|
| Open Companion for the first time | Anonymous sign-in, 6-digit code shown in large type; it refreshes itself before the 30-minute expiry | Supabase Auth > Providers: anonymous sign-ins enabled? `create_pairing_code` RPC in migrations 03? |
| Create a caregiver account, enter code, relationship "wife", patient name | Caregiver lands on Requests tab; Companion switches to the conversation screen within ~5 s | `redeem_pairing_code` returned an error → check code TTL (30 min) and that the circle has no owner yet |
| Long-press the helper's name on Companion for 5 s | New code shown; existing pairing kept (`alreadyPaired` banner, Cancel returns to conversation) | `requestPairingCode` / `care_circles.pairing_code` column |
| Redeem the new code with a second caregiver account | Second member appears under Circle as non-owner; owner can edit them, they cannot edit settings | RLS policies `is_circle_owner` |

## 2. Conversation basics

| Step | Expected |
|---|---|
| Companion connects | "Connecting" then the agent greets the patient by preferred name; captions appear at 28pt+ |
| Ask "What day is it?" | Agent answers with day and part of day, no exact seconds; mentions the town if orientation facts are set |
| Ask "Where am I?" | Agent uses the `home_description` / `town` facts; if none are set it stays calm and redirects rather than guessing |
| Say something distressing ("I'm scared, someone is in the house") | Agent reassures with short sentences, does not argue; a distress alert appears in Caregiver > Summaries within seconds (medium/high also pushes) |
| Stay silent for two minutes | Agent checks in once, then waits; it does not fill the silence repeatedly |
| Say "goodbye" | Agent says a short goodbye and the session ends; a `conversation_sessions` row has `ended_at`, `mood`, `summary_note` |

## 3. Contact request — accepted

| Step | Expected |
|---|---|
| Patient: "I want to talk to my wife" | Agent says it is letting Sarah know and **keeps talking** (non-blocking). Companion shows "Reaching Sarah…" |
| Caregiver receives push, opens it | Deep-links to `request/[id]`, shows the patient's name, the time, and buttons: Call now, reasons, custom |
| Tap **Call now** | Request becomes `accepted`; agent says "Sarah is coming on the line"; Caregiver navigates to the call screen and joins the room |
| Caregiver connected | Request `connected`; agent audio input/output disabled; Companion shows Call screen with Sarah's name and one **Hang up** button |
| Either side hangs up | Request `ended`; Companion returns to conversation; agent resumes with a gentle check-in ("That was nice, talking to Sarah") |

## 4. Contact request — declined

| Step | Expected |
|---|---|
| Patient asks for wife; caregiver taps **At work** | Agent speaks the caregiver's configured `at_work` message with `{name}`/`{patient}` filled in, then redirects gently (offers a topic or a reminder) |
| Caregiver taps **Custom** and types a message | Agent speaks that exact message once, without editorialising |
| Caregiver ignores the request for 90 s (or the configured timeout) | Cron flips it to `expired`; agent speaks the `no_answer_message` (or default) and redirects. The request appears under History as "No answer" |
| Patient asks for someone not in the circle ("my brother") | Agent says it does not have a way to reach them, offers the people it can reach; **no** request row is created |
| Member has `can_receive_calls` off or is in quiet hours | Agent explains they are not available right now, offers another member; no push sent |

## 5. Settings propagate

| Step | Expected |
|---|---|
| Change preferred name, condition, stage, custom guidance; start a new session | Agent uses the new name; behaviour reflects guidance (e.g. "avoid talking about her late husband"). `conversation_sessions.prompt_version` matches `PROMPT_VERSION` |
| Change assistant name and voice | Companion header shows the new name (from `agent_ready`); voice changes on next session |
| Toggle **Store transcripts** on | `conversation_events` rows of type `patient_said` / `assistant_said` appear; off → only tool calls, escalations and session notes |
| Set a member's quiet hours to now | Request for that member is refused in speech; Circle screen shows the quiet-hours label |

## 6. Summaries and alerts

| Step | Expected |
|---|---|
| Invoke `generate-daily-summary` manually (`supabase functions invoke generate-daily-summary --no-verify-jwt --body '{"force":true}'` with the service role key) | A `daily_summaries` row for today; Caregiver > Summaries shows it; push "Today's summary" delivered |
| Wait for the cron (10:00 / 09:00 UTC) | Same result without manual invocation; `cron.job_run_details` shows success |
| Acknowledge an alert | Alert moves out of the unread list; badge count on the tab drops |

## 7. Failure fallbacks (patient must never face a silent screen)

| Break this | Expected on Companion |
|---|---|
| Stop the agent worker, then open Companion | Connects to the room; no `agent_ready` within 25 s → spoken "I am having trouble starting up…" and captioned "Just a moment", with the large **Talk to me** button; automatic retry with back-off |
| Kill the agent worker mid-conversation | Agent participant leaves → same fallback as above; once the worker is back, the next retry recreates the room and a new agent greets the patient |
| Turn off Wi‑Fi mid-conversation | Spoken "I am having a little trouble hearing right now…"; automatic retries with back-off (max 30 s); a single **Talk to me** button |
| Delete the circle's `owner_id` (unpaired) | Token function returns 409 `not_paired`; Companion shows the pairing screen again |
| Kill the Caregiver app during a call | Agent detects participant leave → request `ended`, Companion back to conversation, agent checks in |
| Invalid OpenAI key on the agent | Session `Error` event logged; patient hears the fallback message; the worker does not crash |

## 8. Accessibility spot checks

- Android: **Settings > Display > Font size** to maximum. Companion layout must not clip; captions wrap; buttons stay ≥ 96pt.
- Enable TalkBack / VoiceOver. Every button on both apps announces a label and role; status changes on Companion are announced (live region).
- Enable "Remove animations" / "Reduce motion". The listening orb stops pulsing but still changes colour with state.
- Contrast: run the Companion palette (`apps/companion/src/theme.ts`) through a WCAG checker — all text/background pairs must be ≥ 4.5:1.

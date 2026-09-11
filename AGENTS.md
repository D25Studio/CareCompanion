# Care Companion — code map and conventions

Read this before changing anything. It is short on purpose.

## What the system does

A person living with dementia talks to the **Companion** app. A LiveKit voice agent (OpenAI Realtime) answers, keeps them oriented, and when they ask for a family member it raises a **contact request**. The **Caregiver** app receives a push and the caregiver either joins the call (agent steps aside) or declines with a short message the agent speaks. Every session is logged; a nightly summary and any distress alerts go to the family.

## Where things live

| Path | Runtime | Role |
|---|---|---|
| `packages/shared/src` | TS, consumed as raw source | DB types, zod schemas, constants (room/identity naming, reasons, timeouts), prompt builder, request state machine, data-channel message types. **Single source of truth**; change here first. |
| `services/voice-agent/src` | Node 22 + tsx | LiveKit Agents worker. `main.ts` entry, `tools.ts` LLM tools, `call-bridge.ts` caregiver hand-off, `contact-request-watcher.ts` realtime + poll wait, `session-logger.ts` events + session note, `session-context.ts` settings/members. |
| `supabase/migrations` | Postgres | Schema, RLS, RPCs (`create_pairing_code`, `redeem_pairing_code`, `respond_to_contact_request`, `expire_stale_contact_requests`, `register_push_token`), pg_cron. |
| `supabase/functions` | Deno Edge | `livekit-token` (mints tokens + agent dispatch), `notify-request` (Expo push), `generate-daily-summary` (LLM summary). `_shared/constants.ts` duplicates a few shared constants because Edge bundling cannot reach `packages/`; keep them in sync. |
| `apps/companion` | Expo 57 dev build | Patient app. One screen (`ConversationScreen`), plus `PairingScreen` and `CallScreen`. No navigation, no settings. |
| `apps/caregiver` | Expo 57 dev build | Family app. Expo Router: `(auth)`, `onboarding/pair`, `(tabs)` requests/summaries/circle/settings, `request/[id]`, `call/[requestId]`, `member/[id]`. |
| `scripts/` | PowerShell | Tool install, check (install+typecheck+test), Supabase deploy, agent dev. |
| `docs/` | Markdown | `verification.md`: manual end-to-end test scenarios. |

## Invariants (do not break)

- **Room and identity naming** come from `@care/shared` (`roomNameForCircle`, `patientIdentity`, `caregiverIdentity`). The agent, the token function and both apps rely on them.
- **Contact request status** only changes via `respond_to_contact_request` (caregiver), the agent (connected/ended) or the cron (`expired`). Valid transitions live in `request-state-machine.ts` and are mirrored by the RPC's checks.
- **Data-channel messages** on topic `care-companion` are JSON validated with the zod schemas in `data-messages.ts`. Add a new message type there, then handle it in `main.ts` and `useCompanionRoom.ts`.
- **Agent dispatch** is explicit: the patient token carries a `RoomAgentDispatch` for `LIVEKIT_AGENT_NAME`; caregiver tokens carry none. The worker never auto-joins rooms.
- **Prompt structure**: identity, universal `HOW YOU COME ACROSS` (anti-patronising rules, condition-agnostic), then the `ConditionProfile` (communication rules, subtype, stage), universal `KEEPING CALM` + profile additions, boundaries, reaching family, `SAFETY` + profile additions, orientation facts, member list, then caregiver `custom_guidance` (subordinate), tools. Universal text lives in `prompts/companion-core.ts`; condition text lives in one profile file per condition, registered in `prompts/condition-profiles.ts`. Never put condition-specific wording in the universal sections. Bump `PROMPT_VERSION` when changing wording; it is stored on every session row.
- **Tone**: the companion talks to the person as an adult equal. No praise, pet names, "shall we", constant check-ins or counselling phrases; the prompt bans these explicitly. Any new spoken text (tool return strings, fixed lines like the goodbye) must follow the same rules.
- **Privacy**: transcripts are stored only when `patient_settings.store_transcripts` is true. Session notes (short, non-verbatim) are always stored. Service-role keys never reach the apps.
- **Non-blocking contact requests**: `request_contact` calls `ctx.update()` before waiting, so the agent keeps talking while the caregiver decides. Do not turn it into a blocking tool.

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`. ESM everywhere; the agent imports with `.ts` extensions (tsx).
- No abbreviations in identifiers. Comments explain *why*.
- Patient-facing UI: minimum touch target 96pt, captions 28pt+, every `<Text>` has `maxFontSizeMultiplier={MAX_FONT_SCALE}`, every control has `accessibilityLabel` and `accessibilityRole`, colours meet WCAG AA on their backgrounds. Anything the patient must read is also spoken.
- Caregiver UI: standard sizes (48pt targets), labels on every control, no colour-only status (always text + colour).
- Every failure the patient could notice has a spoken fallback in `speech-fallback.ts`; never leave a silent screen.
- Tests: vitest in `packages/shared` and `services/voice-agent`. Run `pnpm test` from the root. Add a test when touching the prompt builder, the state machine, member matching or the request watcher.

## Commands

```powershell
pnpm install
pnpm -r typecheck
pnpm test
pnpm agent:dev            # services/voice-agent in dev mode
pnpm companion            # expo start for the patient app
pnpm caregiver            # expo start for the family app
.\scripts\check.ps1       # everything above that runs headless
```

## Regenerating database types

`packages/shared/src/database.types.ts` is hand-maintained to match the migrations. After changing a migration, either edit it by hand or run
`npx supabase gen types typescript --linked > packages/shared/src/database.types.ts` and re-add the `Tables<>`/alias exports at the bottom.

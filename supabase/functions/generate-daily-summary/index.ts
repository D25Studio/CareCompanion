/**
 * generate-daily-summary
 *
 * Writes one summary per circle for the current local day (SUMMARY_TIMEZONE), using
 * the day's session notes, contact requests and alerts, then notifies members.
 * Triggered by pg_cron (see migrations/..._cron.sql). Safe to run more than once:
 * circles that already have a summary for the day are skipped.
 *
 * Optional body: { date: 'YYYY-MM-DD', circleId?: uuid } to (re)generate a specific day.
 */
import { z } from 'zod';

import { DAILY_SUMMARY_SYSTEM_PROMPT } from '../_shared/constants.ts';
import { error, handleOptions, isServiceRoleRequest, json } from '../_shared/http.ts';
import { completeText } from '../_shared/openai.ts';
import { sendPushToProfiles } from '../_shared/push.ts';
import { createAdminClient } from '../_shared/supabase.ts';

const bodySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    circleId: z.string().uuid().optional(),
    force: z.boolean().optional(),
  })
  .default({});

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  mood_estimate: string | null;
  distress_flagged: boolean;
  summary: string | null;
}

interface RequestRow {
  id: string;
  status: string;
  decline_reason_key: string | null;
  created_at: string;
  target_member_id: string;
}

interface AlertRow {
  level: string;
  note: string;
  created_at: string;
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) {
    return preflight;
  }
  if (!isServiceRoleRequest(request)) {
    return error('Forbidden', 403);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return error('Invalid body', 400, { issues: parsed.error.issues });
  }

  const timeZone = Deno.env.get('SUMMARY_TIMEZONE') ?? 'Australia/Sydney';
  const summaryDate = parsed.data.date ?? localDateString(new Date(), timeZone);
  const { start, end } = localDayBounds(summaryDate, timeZone);

  const admin = createAdminClient();

  // Circles with any activity in the window.
  const [{ data: sessionCircles }, { data: requestCircles }] = await Promise.all([
    admin.from('conversation_sessions').select('circle_id').gte('started_at', start).lt('started_at', end),
    admin.from('contact_requests').select('circle_id').gte('created_at', start).lt('created_at', end),
  ]);

  let circleIds = [
    ...new Set([
      ...(sessionCircles ?? []).map((row: { circle_id: string }) => row.circle_id),
      ...(requestCircles ?? []).map((row: { circle_id: string }) => row.circle_id),
    ]),
  ];
  if (parsed.data.circleId) {
    circleIds = circleIds.filter((id) => id === parsed.data.circleId);
    if (circleIds.length === 0) {
      circleIds = [parsed.data.circleId];
    }
  }

  const results: Array<{ circleId: string; status: 'created' | 'skipped' | 'failed'; reason?: string }> = [];

  for (const circleId of circleIds) {
    try {
      if (!parsed.data.force) {
        const { data: existing } = await admin
          .from('daily_summaries')
          .select('id')
          .eq('circle_id', circleId)
          .eq('summary_date', summaryDate)
          .maybeSingle();
        if (existing) {
          results.push({ circleId, status: 'skipped', reason: 'already summarised' });
          continue;
        }
      }

      const [{ data: sessions }, { data: requests }, { data: alerts }, { data: members }, { data: settings }] =
        await Promise.all([
          admin
            .from('conversation_sessions')
            .select('id, started_at, ended_at, mood_estimate, distress_flagged, summary')
            .eq('circle_id', circleId)
            .gte('started_at', start)
            .lt('started_at', end)
            .order('started_at'),
          admin
            .from('contact_requests')
            .select('id, status, decline_reason_key, created_at, target_member_id')
            .eq('circle_id', circleId)
            .gte('created_at', start)
            .lt('created_at', end)
            .order('created_at'),
          admin
            .from('alerts')
            .select('level, note, created_at')
            .eq('circle_id', circleId)
            .gte('created_at', start)
            .lt('created_at', end)
            .order('created_at'),
          admin.from('care_circle_members').select('id, caregiver_id, relationship_label').eq('circle_id', circleId),
          admin.from('patient_settings').select('preferred_name').eq('circle_id', circleId).maybeSingle(),
        ]);

      const memberLabel = new Map<string, string>(
        (members ?? []).map((member: { id: string; relationship_label: string }) => [member.id, member.relationship_label]),
      );
      const patientName = settings?.preferred_name || 'Your family member';

      const summaryInput = buildSummaryInput({
        patientName,
        timeZone,
        sessions: (sessions ?? []) as SessionRow[],
        requests: (requests ?? []) as RequestRow[],
        alerts: (alerts ?? []) as AlertRow[],
        memberLabel,
      });

      const summaryText = await completeText({
        system: DAILY_SUMMARY_SYSTEM_PROMPT,
        user: summaryInput,
        maxTokens: 400,
      });

      const flags = (alerts ?? []).map((alert: AlertRow) => ({
        level: alert.level,
        note: alert.note,
        at: alert.created_at,
      }));

      const { data: inserted, error: insertError } = await admin
        .from('daily_summaries')
        .upsert(
          {
            circle_id: circleId,
            summary_date: summaryDate,
            summary_text: summaryText,
            request_count: (requests ?? []).length,
            session_count: (sessions ?? []).length,
            flags,
          },
          { onConflict: 'circle_id,summary_date' },
        )
        .select('id')
        .single();
      if (insertError || !inserted) {
        throw new Error(insertError?.message ?? 'insert failed');
      }

      await sendPushToProfiles(
        admin,
        (members ?? []).map((member: { caregiver_id: string }) => member.caregiver_id),
        {
          title: `Today with ${patientName}`,
          body: 'Your daily summary is ready.',
          priority: 'default',
          channelId: 'summaries',
          data: { type: 'daily_summary', circleId, summaryId: inserted.id },
        },
      );

      results.push({ circleId, status: 'created' });
    } catch (caught) {
      console.error('generate-daily-summary: failed for circle', circleId, caught);
      results.push({ circleId, status: 'failed', reason: String(caught) });
    }
  }

  return json({ summaryDate, timeZone, results });
});

function buildSummaryInput(input: {
  patientName: string;
  timeZone: string;
  sessions: SessionRow[];
  requests: RequestRow[];
  alerts: AlertRow[];
  memberLabel: Map<string, string>;
}): string {
  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: input.timeZone }).format(
      new Date(iso),
    );

  const lines: string[] = [`Person: ${input.patientName}`, ''];

  lines.push(`Sessions (${input.sessions.length}):`);
  if (input.sessions.length === 0) {
    lines.push('- none');
  }
  for (const session of input.sessions) {
    const duration = session.ended_at
      ? `${Math.max(1, Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000))} min`
      : 'ongoing';
    lines.push(
      `- ${time(session.started_at)} (${duration})${session.mood_estimate ? `, mood: ${session.mood_estimate}` : ''}${
        session.distress_flagged ? ', distress flagged' : ''
      }`,
    );
    if (session.summary) {
      lines.push(`  note: ${session.summary}`);
    }
  }

  lines.push('', `Contact requests (${input.requests.length}):`);
  if (input.requests.length === 0) {
    lines.push('- none');
  }
  for (const contactRequest of input.requests) {
    const who = input.memberLabel.get(contactRequest.target_member_id) ?? 'family member';
    const outcome =
      contactRequest.status === 'declined' && contactRequest.decline_reason_key
        ? `declined (${contactRequest.decline_reason_key.replaceAll('_', ' ')})`
        : contactRequest.status;
    lines.push(`- ${time(contactRequest.created_at)} asked for ${who}: ${outcome}`);
  }

  lines.push('', `Alerts (${input.alerts.length}):`);
  if (input.alerts.length === 0) {
    lines.push('- none');
  }
  for (const alert of input.alerts) {
    lines.push(`- ${time(alert.created_at)} [${alert.level}] ${alert.note}`);
  }

  return lines.join('\n');
}

/** YYYY-MM-DD for `date` in the given IANA time zone. */
function localDateString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** UTC ISO bounds [start, end) of a local calendar day. */
function localDayBounds(dateString: string, timeZone: string): { start: string; end: string } {
  const [year, month, day] = dateString.split('-').map(Number) as [number, number, number];
  const startLocal = zonedTimeToUtc(year, month, day, timeZone);
  const endLocal = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);
  return { start: startLocal.toISOString(), end: endLocal.toISOString() };
}

/** Finds the UTC instant for local midnight on the given date in `timeZone`. */
function zonedTimeToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMinutes = timeZoneOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offsetMinutes * 60 * 1000);
}

function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - date.getTime()) / 60000;
}

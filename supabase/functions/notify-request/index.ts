/**
 * notify-request
 *
 * Sends push notifications to caregivers. Called server-to-server by the voice agent
 * (and by generate-daily-summary) with the service role key.
 *
 * Body:
 *  { type: 'contact_request', requestId }
 *  { type: 'distress', circleId, sessionId, level, note }
 *  { type: 'daily_summary', circleId, summaryId }
 */
import { z } from 'zod';

import { error, handleOptions, isServiceRoleRequest, json } from '../_shared/http.ts';
import { sendPushToProfiles } from '../_shared/push.ts';
import { createAdminClient } from '../_shared/supabase.ts';

const payloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('contact_request'), requestId: z.string().uuid() }),
  z.object({
    type: z.literal('distress'),
    circleId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    level: z.enum(['low', 'medium', 'high']),
    note: z.string().max(1000),
  }),
  z.object({ type: z.literal('daily_summary'), circleId: z.string().uuid(), summaryId: z.string().uuid() }),
]);

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) {
    return preflight;
  }
  if (request.method !== 'POST') {
    return error('Method not allowed', 405);
  }
  if (!isServiceRoleRequest(request)) {
    return error('Forbidden', 403);
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return error('Invalid payload', 400, { issues: parsed.error.issues });
  }
  const payload = parsed.data;
  const admin = createAdminClient();

  switch (payload.type) {
    case 'contact_request': {
      const { data: contactRequest } = await admin
        .from('contact_requests')
        .select('id, circle_id, target_member_id, status')
        .eq('id', payload.requestId)
        .maybeSingle();
      if (!contactRequest) {
        return error('Request not found', 404);
      }

      const [{ data: member }, { data: settings }] = await Promise.all([
        admin
          .from('care_circle_members')
          .select('caregiver_id, relationship_label')
          .eq('id', contactRequest.target_member_id)
          .maybeSingle(),
        admin.from('patient_settings').select('preferred_name').eq('circle_id', contactRequest.circle_id).maybeSingle(),
      ]);
      if (!member) {
        return error('Target member not found', 404);
      }

      const patientName = settings?.preferred_name || 'Your family member';
      const result = await sendPushToProfiles(admin, [member.caregiver_id], {
        title: `${patientName} would like to talk`,
        body: 'Tap to call now, or let them know why you cannot talk right now.',
        priority: 'high',
        channelId: 'contact-requests',
        data: { type: 'contact_request', requestId: contactRequest.id, circleId: contactRequest.circle_id },
      });
      return json({ ok: true, ...result });
    }

    case 'distress': {
      const [{ data: members }, { data: settings }] = await Promise.all([
        admin.from('care_circle_members').select('caregiver_id, is_owner').eq('circle_id', payload.circleId),
        admin.from('patient_settings').select('preferred_name').eq('circle_id', payload.circleId).maybeSingle(),
      ]);
      const patientName = settings?.preferred_name || 'Your family member';

      // Low-level flags are informational and go to owners only; medium/high go to everyone.
      const recipients = (members ?? [])
        .filter((member: { is_owner: boolean }) => payload.level !== 'low' || member.is_owner)
        .map((member: { caregiver_id: string }) => member.caregiver_id);

      const title =
        payload.level === 'high'
          ? `Urgent: ${patientName} may need help`
          : payload.level === 'medium'
            ? `${patientName} seems unsettled`
            : `Note about ${patientName}`;

      const result = await sendPushToProfiles(admin, recipients, {
        title,
        body: payload.note.slice(0, 180),
        priority: 'high',
        channelId: payload.level === 'high' ? 'urgent-alerts' : 'alerts',
        data: { type: 'distress', circleId: payload.circleId, sessionId: payload.sessionId, level: payload.level },
      });
      return json({ ok: true, ...result });
    }

    case 'daily_summary': {
      const [{ data: members }, { data: settings }] = await Promise.all([
        admin.from('care_circle_members').select('caregiver_id').eq('circle_id', payload.circleId),
        admin.from('patient_settings').select('preferred_name').eq('circle_id', payload.circleId).maybeSingle(),
      ]);
      const patientName = settings?.preferred_name || 'your family member';
      const result = await sendPushToProfiles(
        admin,
        (members ?? []).map((member: { caregiver_id: string }) => member.caregiver_id),
        {
          title: `Today with ${patientName}`,
          body: 'Your daily summary is ready.',
          priority: 'default',
          channelId: 'summaries',
          data: { type: 'daily_summary', circleId: payload.circleId, summaryId: payload.summaryId },
        },
      );
      return json({ ok: true, ...result });
    }
  }
});

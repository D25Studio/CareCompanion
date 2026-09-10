/**
 * livekit-token
 *
 * Mints a LiveKit access token for the calling user.
 *  - role "patient": joins their own circle room and dispatches the voice agent to it.
 *  - role "caregiver": joins the circle room to take an accepted contact request.
 *
 * Request body: { role: 'patient', circleId } | { role: 'caregiver', circleId, requestId }
 * Response:     { url, token, roomName, identity }
 */
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { AccessToken } from 'livekit-server-sdk';
import { z } from 'zod';

import { caregiverIdentity, patientIdentity, roomNameForCircle } from '../_shared/constants.ts';
import { error, handleOptions, json, requireEnv } from '../_shared/http.ts';
import { createAdminClient, getCallingUserId } from '../_shared/supabase.ts';

const requestSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('patient'), circleId: z.string().uuid() }),
  z.object({ role: z.literal('caregiver'), circleId: z.string().uuid(), requestId: z.string().uuid() }),
]);

const PATIENT_TOKEN_TTL = '12h';
const CAREGIVER_TOKEN_TTL = '1h';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) {
    return preflight;
  }
  if (request.method !== 'POST') {
    return error('Method not allowed', 405);
  }

  const userId = await getCallingUserId(request);
  if (!userId) {
    return error('Not signed in', 401);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return error('Invalid request body', 400, { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const admin = createAdminClient();
  const roomName = roomNameForCircle(body.circleId);

  const { data: circle, error: circleError } = await admin
    .from('care_circles')
    .select('id, patient_id, owner_id')
    .eq('id', body.circleId)
    .maybeSingle();
  if (circleError || !circle) {
    return error('Circle not found', 404);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  const displayName = profile?.display_name ?? '';

  const token = new AccessToken(requireEnv('LIVEKIT_API_KEY'), requireEnv('LIVEKIT_API_SECRET'), {
    identity: body.role === 'patient' ? patientIdentity(userId) : caregiverIdentity(userId),
    name: displayName,
    ttl: body.role === 'patient' ? PATIENT_TOKEN_TTL : CAREGIVER_TOKEN_TTL,
  });

  if (body.role === 'patient') {
    if (circle.patient_id !== userId) {
      return error('This device is not the patient for that circle', 403);
    }
    if (!circle.owner_id) {
      return error('This circle has not been paired with a caregiver yet', 409, { code: 'not_paired' });
    }

    token.addGrant({
      room: roomName,
      roomJoin: true,
      roomCreate: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    // Explicit dispatch: the agent worker registered with LIVEKIT_AGENT_NAME joins this room.
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: requireEnv('LIVEKIT_AGENT_NAME'),
          metadata: JSON.stringify({ circleId: body.circleId, patientId: userId }),
        }),
      ],
    });
  } else {
    const { data: membership } = await admin
      .from('care_circle_members')
      .select('id, is_owner')
      .eq('circle_id', body.circleId)
      .eq('caregiver_id', userId)
      .maybeSingle();
    if (!membership) {
      return error('You are not a member of this circle', 403);
    }

    const { data: contactRequest } = await admin
      .from('contact_requests')
      .select('id, status, target_member_id, livekit_room')
      .eq('id', body.requestId)
      .eq('circle_id', body.circleId)
      .maybeSingle();
    if (!contactRequest) {
      return error('Contact request not found', 404);
    }
    if (contactRequest.status !== 'accepted' && contactRequest.status !== 'connected') {
      return error(`This request is ${contactRequest.status}; only accepted requests can be joined`, 409, {
        code: 'request_not_joinable',
        status: contactRequest.status,
      });
    }
    if (contactRequest.target_member_id !== membership.id && !membership.is_owner) {
      return error('This request was sent to someone else', 403);
    }

    token.addGrant({
      room: contactRequest.livekit_room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    token.metadata = JSON.stringify({ requestId: body.requestId });
  }

  return json({
    url: requireEnv('LIVEKIT_URL'),
    token: await token.toJwt(),
    roomName,
    identity: token.identity,
  });
});

import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { UNAVAILABLE_REASONS, type UnavailableReasonKey, UNAVAILABLE_REASON_KEYS, fillMessageTemplate } from '@care/shared';

import { Body, Button, Card, Chip, ErrorText, Field, Heading, Loading, Row, Screen, Small, Spacer, Title } from '@/components/ui';
import { friendlyError, respondToRequest } from '@/lib/api';
import { formatDateTime, statusLabel } from '@/lib/format';
import { useContactRequest } from '@/hooks/useContactRequests';
import { useAuth } from '@/providers/AuthProvider';
import { useCircle } from '@/providers/CircleProvider';

/**
 * One contact request. While pending: "Call now" or a one-tap reason (with the exact words
 * the helper will speak shown underneath), or a custom message. Once accepted: join the call.
 */
export default function RequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { circle, members, settings } = useCircle();
  const { request, loading } = useContactRequest(id ?? null);

  const [selectedReason, setSelectedReason] = useState<UnavailableReasonKey | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  if (loading || !circle) {
    return <Loading />;
  }
  if (!request) {
    return (
      <Screen>
        <Title>Request not found</Title>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const patientName = settings?.preferred_name || 'Your family member';
  const member = members.find((candidate) => candidate.id === request.target_member_id);
  const myName = profile?.display_name || member?.profile?.display_name || 'They';
  const responses = (settings?.unavailable_responses ?? {}) as Partial<Record<UnavailableReasonKey, string>>;

  const previewFor = (key: UnavailableReasonKey) =>
    fillMessageTemplate(responses[key] ?? UNAVAILABLE_REASONS[key].defaultMessage, { name: myName, patient: patientName });

  const accept = async () => {
    setError(null);
    setBusy('accept');
    try {
      await respondToRequest(request.id, 'accept');
      router.replace({ pathname: '/call/[requestId]', params: { requestId: request.id } });
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    setError(null);
    if (!selectedReason && !customMessage.trim()) {
      setError('Pick a reason or write a short message first.');
      return;
    }
    setBusy('decline');
    try {
      await respondToRequest(request.id, 'decline', selectedReason, customMessage.trim() || null);
      router.back();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Title>{patientName} wants to talk</Title>
      <Small>
        Asked for {member ? `${member.profile?.display_name ?? ''} (${member.relationship_label})`.trim() : 'a family member'} at{' '}
        {formatDateTime(request.created_at)}
      </Small>

      {request.status === 'pending' ? (
        <>
          <Button label="Call now" onPress={() => void accept()} loading={busy === 'accept'} disabled={busy !== null} />

          <Spacer size="sm" />
          <Heading>Can't talk right now?</Heading>
          <Body muted>Tap a reason. The helper will speak these exact words to {patientName}:</Body>
          <Row>
            {UNAVAILABLE_REASON_KEYS.map((key) => (
              <Chip
                key={key}
                label={UNAVAILABLE_REASONS[key].label}
                selected={selectedReason === key}
                onPress={() => setSelectedReason((current) => (current === key ? null : key))}
              />
            ))}
          </Row>
          {selectedReason ? (
            <Card tone="success">
              <Body>"{previewFor(selectedReason)}"</Body>
            </Card>
          ) : null}
          <Field
            label="Or say it in your own words"
            value={customMessage}
            onChangeText={setCustomMessage}
            placeholder={`e.g. ${myName} is at the shops and will ring you at 3.`}
            hint="Keep it short and simple. Use {name} for your name and {patient} for theirs."
            multiline
          />
          <ErrorText>{error}</ErrorText>
          <Button
            label="Send this message"
            variant="secondary"
            onPress={() => void decline()}
            loading={busy === 'decline'}
            disabled={busy !== null || (!selectedReason && !customMessage.trim())}
          />
        </>
      ) : request.status === 'accepted' || request.status === 'connected' ? (
        <>
          <Card tone="success">
            <Heading>{statusLabel(request.status)}</Heading>
            <Body>{patientName} has been told you are coming on the line.</Body>
          </Card>
          <Button
            label="Join the call"
            onPress={() => router.replace({ pathname: '/call/[requestId]', params: { requestId: request.id } })}
          />
        </>
      ) : (
        <Card>
          <Heading>{statusLabel(request.status, request.decline_reason_key)}</Heading>
          {request.decline_message ? <Body>"{request.decline_message}"</Body> : null}
          {request.responded_at ? <Small>Answered {formatDateTime(request.responded_at)}</Small> : null}
        </Card>
      )}
    </Screen>
  );
}

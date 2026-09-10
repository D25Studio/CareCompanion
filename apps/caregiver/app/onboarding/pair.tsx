import { useRouter } from 'expo-router';
import { useState } from 'react';

import { PAIRING_CODE_LENGTH } from '@care/shared';

import { Body, Button, Card, ErrorText, Field, Heading, Screen, Spacer, Title } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useCircle } from '@/providers/CircleProvider';

/**
 * Pairing: the patient's phone shows a 6-digit code when the Companion app is opened
 * for the first time. The caregiver types it here. The first caregiver to pair becomes
 * the circle owner; later caregivers join as members using a fresh code.
 */
export default function Pair() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { refresh, circle } = useCircle();
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState('');
  const [patientName, setPatientName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data: circleId, error: rpcError } = await supabase.rpc('redeem_pairing_code', {
        p_code: code.trim(),
        p_relationship_label: relationship.trim().toLowerCase(),
        p_circle_name: patientName.trim() ? `${patientName.trim()}'s circle` : '',
      });
      if (rpcError) {
        throw new Error(rpcError.message);
      }
      if (patientName.trim() && circleId) {
        // First caregiver sets the preferred name; ignored if not owner (RLS).
        await supabase
          .from('patient_settings')
          .update({ preferred_name: patientName.trim() })
          .eq('circle_id', circleId)
          .eq('preferred_name', '');
      }
      await refresh();
      router.replace('/(tabs)/requests');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{circle ? 'Connect another phone' : 'Connect their phone'}</Title>
      <Card>
        <Heading>How this works</Heading>
        <Body>1. Install the Companion app on your family member's phone and open it.</Body>
        <Body>2. It shows a 6-digit code. Type that code below.</Body>
        <Body>3. Their phone will start talking as soon as you finish.</Body>
      </Card>
      <Spacer size="sm" />
      <Field
        label="6-digit code from their phone"
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, PAIRING_CODE_LENGTH))}
        keyboardType="number-pad"
        maxLength={PAIRING_CODE_LENGTH}
        autoComplete="one-time-code"
      />
      <Field
        label="You are their..."
        value={relationship}
        onChangeText={setRelationship}
        placeholder="wife, son, daughter, carer"
        hint="The word they use for you. The helper listens for it: 'I want to talk to my wife'."
        autoCapitalize="none"
      />
      <Field
        label="Their first name (what they like to be called)"
        value={patientName}
        onChangeText={setPatientName}
        hint="You can change this later in Settings."
      />
      <ErrorText>{error}</ErrorText>
      <Button
        label="Connect"
        onPress={() => void submit()}
        loading={busy}
        disabled={code.length !== PAIRING_CODE_LENGTH || !relationship.trim()}
      />
      {circle ? (
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      ) : (
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      )}
    </Screen>
  );
}

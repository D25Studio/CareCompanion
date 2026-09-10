import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { memberUpdateSchema } from '@care/shared';

import { Body, Button, ErrorText, Field, Loading, Screen, Title, ToggleRow } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useCircle } from '@/providers/CircleProvider';

/** Owner-only: relationship word, availability and quiet hours for one family member. */
export default function EditMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { members, isOwner, refresh, loading } = useCircle();
  const member = members.find((candidate) => candidate.id === id);

  const [relationship, setRelationship] = useState(member?.relationship_label ?? '');
  const [canReceiveCalls, setCanReceiveCalls] = useState(member?.can_receive_calls ?? true);
  const [quietStart, setQuietStart] = useState(member?.quiet_hours_start?.slice(0, 5) ?? '');
  const [quietEnd, setQuietEnd] = useState(member?.quiet_hours_end?.slice(0, 5) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <Loading />;
  }
  if (!member) {
    return (
      <Screen>
        <Title>Member not found</Title>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!isOwner) {
    return (
      <Screen>
        <Title>Owner only</Title>
        <Body muted>Only the circle owner can change family member settings.</Body>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const save = async () => {
    setError(null);
    const parsed = memberUpdateSchema.safeParse({
      relationship_label: relationship,
      can_receive_calls: canReceiveCalls,
      quiet_hours_start: quietStart.trim() || null,
      quiet_hours_end: quietEnd.trim() || null,
    });
    if (!parsed.success) {
      setError('Check the relationship word and use 24-hour times like 22:00.');
      return;
    }
    if ((parsed.data.quiet_hours_start && !parsed.data.quiet_hours_end) || (!parsed.data.quiet_hours_start && parsed.data.quiet_hours_end)) {
      setError('Enter both a start and an end for quiet hours, or leave both empty.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase
        .from('care_circle_members')
        .update({ ...parsed.data, relationship_label: parsed.data.relationship_label.toLowerCase() })
        .eq('id', member.id);
      if (updateError) {
        throw new Error(updateError.message);
      }
      await refresh();
      router.back();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { error: deleteError } = await supabase.from('care_circle_members').delete().eq('id', member.id);
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      await refresh();
      router.back();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{member.profile?.display_name || 'Family member'}</Title>
      <Field
        label="Relationship word"
        value={relationship}
        onChangeText={setRelationship}
        autoCapitalize="none"
        hint='What your family member calls this person, e.g. "wife", "son", "Sarah". The helper listens for it.'
      />
      <ToggleRow
        label="Can be contacted"
        description="Turn off during holidays or shifts. The helper will use the 'Other' message instead of sending a request."
        value={canReceiveCalls}
        onValueChange={setCanReceiveCalls}
      />
      <Field label="Quiet hours start (24h)" value={quietStart} onChangeText={setQuietStart} placeholder="22:00" keyboardType="numbers-and-punctuation" />
      <Field
        label="Quiet hours end (24h)"
        value={quietEnd}
        onChangeText={setQuietEnd}
        placeholder="07:00"
        keyboardType="numbers-and-punctuation"
        hint="During quiet hours no request is sent; the helper gently explains this person is resting."
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Save" onPress={() => void save()} loading={busy} />
      {!member.is_owner ? <Button label="Remove from circle" variant="danger" onPress={() => void remove()} disabled={busy} /> : null}
    </Screen>
  );
}

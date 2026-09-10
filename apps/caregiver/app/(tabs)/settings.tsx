import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import {
  DEFAULT_NO_ANSWER_MESSAGE,
  DEMENTIA_CONDITIONS,
  DEMENTIA_CONDITION_LABELS,
  DEMENTIA_STAGES,
  DEMENTIA_STAGE_LABELS,
  type DementiaCondition,
  type DementiaStage,
  MAX_CONTACT_REQUEST_TIMEOUT_SECONDS,
  MIN_CONTACT_REQUEST_TIMEOUT_SECONDS,
  UNAVAILABLE_REASONS,
  UNAVAILABLE_REASON_KEYS,
  type UnavailableReasonKey,
  patientSettingsUpdateSchema,
} from '@care/shared';

import { Body, Button, Card, Chip, ErrorText, Field, Heading, Loading, Row, Small, Spacer, ToggleRow } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useCircle } from '@/providers/CircleProvider';
import { spacing } from '@/theme';

const VOICES = ['marin', 'cedar', 'alloy', 'ash', 'coral', 'sage', 'shimmer', 'verse'] as const;

interface FactRow {
  key: string;
  value: string;
}

/**
 * Everything the owner can tune about how the helper behaves. Changes apply the next time
 * the patient's phone starts a conversation.
 */
export default function Settings() {
  const { circle, settings, isOwner, loading, refresh } = useCircle();

  const [preferredName, setPreferredName] = useState('');
  const [condition, setCondition] = useState<DementiaCondition>('unspecified');
  const [stage, setStage] = useState<DementiaStage>('unspecified');
  const [assistantName, setAssistantName] = useState('Companion');
  const [voice, setVoice] = useState<string>('marin');
  const [speakingRate, setSpeakingRate] = useState('0.9');
  const [facts, setFacts] = useState<FactRow[]>([]);
  const [guidance, setGuidance] = useState('');
  const [responses, setResponses] = useState<Partial<Record<UnavailableReasonKey, string>>>({});
  const [noAnswer, setNoAnswer] = useState('');
  const [timeout, setTimeoutSeconds] = useState('90');
  const [storeTranscripts, setStoreTranscripts] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) {
      return;
    }
    setPreferredName(settings.preferred_name);
    setCondition(settings.condition);
    setStage(settings.stage);
    setAssistantName(settings.assistant_name);
    setVoice(settings.assistant_voice);
    setSpeakingRate(String(settings.speaking_rate));
    setFacts(Object.entries((settings.orientation_facts as Record<string, string>) ?? {}).map(([key, value]) => ({ key, value })));
    setGuidance(settings.custom_guidance ?? '');
    setResponses((settings.unavailable_responses as Partial<Record<UnavailableReasonKey, string>>) ?? {});
    setNoAnswer(settings.no_answer_message ?? '');
    setTimeoutSeconds(String(settings.request_timeout_seconds));
    setStoreTranscripts(settings.store_transcripts);
  }, [settings]);

  if (loading || !circle) {
    return <Loading />;
  }

  const save = async () => {
    setError(null);
    setSaved(false);

    const orientationFacts = Object.fromEntries(
      facts.filter((fact) => fact.key.trim() && fact.value.trim()).map((fact) => [fact.key.trim().toLowerCase().replaceAll(' ', '_'), fact.value.trim()]),
    );
    const unavailableResponses = Object.fromEntries(
      Object.entries(responses).filter(([, value]) => value && value.trim().length > 0).map(([key, value]) => [key, value!.trim()]),
    );

    const parsed = patientSettingsUpdateSchema.safeParse({
      preferred_name: preferredName,
      condition,
      stage,
      assistant_name: assistantName,
      assistant_voice: voice,
      speaking_rate: Number(speakingRate),
      orientation_facts: orientationFacts,
      custom_guidance: guidance.trim() || null,
      unavailable_responses: unavailableResponses,
      no_answer_message: noAnswer.trim() || null,
      request_timeout_seconds: Number(timeout),
      store_transcripts: storeTranscripts,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(first ? `${first.path.join('.')}: ${first.message}` : 'Please check the form.');
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.from('patient_settings').update(parsed.data).eq('circle_id', circle.id);
      if (updateError) {
        throw new Error(updateError.message);
      }
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  const readOnly = !isOwner;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {readOnly ? (
        <Card tone="warning">
          <Body>Only the circle owner can change these settings. You can still read them.</Body>
        </Card>
      ) : null}

      <Heading>About them</Heading>
      <Field label="What they like to be called" value={preferredName} onChangeText={setPreferredName} editable={!readOnly} />
      <Small>Type of dementia</Small>
      <Row>
        {DEMENTIA_CONDITIONS.map((value) => (
          <Chip key={value} label={DEMENTIA_CONDITION_LABELS[value]} selected={condition === value} onPress={() => !readOnly && setCondition(value)} />
        ))}
      </Row>
      <Small>Stage</Small>
      <Row>
        {DEMENTIA_STAGES.map((value) => (
          <Chip key={value} label={DEMENTIA_STAGE_LABELS[value]} selected={stage === value} onPress={() => !readOnly && setStage(value)} />
        ))}
      </Row>
      <Small>The helper adjusts how it speaks based on these. It never mentions the diagnosis unless they raise it.</Small>

      <Spacer size="sm" />
      <Heading>The helper</Heading>
      <Field label="Helper's name" value={assistantName} onChangeText={setAssistantName} editable={!readOnly} hint="A simple, friendly name they can say." />
      <Small>Voice</Small>
      <Row>
        {VOICES.map((value) => (
          <Chip key={value} label={value} selected={voice === value} onPress={() => !readOnly && setVoice(value)} />
        ))}
      </Row>
      <Field
        label="Speaking speed (0.5 slow to 1.2 fast)"
        value={speakingRate}
        onChangeText={setSpeakingRate}
        keyboardType="decimal-pad"
        editable={!readOnly}
        hint="0.9 is a gentle, unhurried pace."
      />

      <Spacer size="sm" />
      <Heading>Facts the helper may share</Heading>
      <Small>Simple, reassuring facts for when they ask where they are or who is coming. Keep each one short.</Small>
      {facts.map((fact, index) => (
        <Card key={index}>
          <Field
            label="Fact"
            value={fact.key}
            onChangeText={(text) => setFacts((current) => current.map((row, i) => (i === index ? { ...row, key: text } : row)))}
            placeholder="home"
            editable={!readOnly}
          />
          <Field
            label="What to say"
            value={fact.value}
            onChangeText={(text) => setFacts((current) => current.map((row, i) => (i === index ? { ...row, value: text } : row)))}
            placeholder="You are at home in Manly, where you have lived for 30 years."
            editable={!readOnly}
            multiline
          />
          {!readOnly ? <Button label="Remove" variant="ghost" onPress={() => setFacts((current) => current.filter((_, i) => i !== index))} /> : null}
        </Card>
      ))}
      {!readOnly ? <Button label="Add a fact" variant="ghost" onPress={() => setFacts((current) => [...current, { key: '', value: '' }])} /> : null}

      <Spacer size="sm" />
      <Heading>Your guidance</Heading>
      <Field
        label="Anything the helper should know"
        value={guidance}
        onChangeText={setGuidance}
        multiline
        editable={!readOnly}
        placeholder="Bob loves talking about his boat, the Seabird. He gets upset if anyone mentions his brother Frank."
        hint="This is added to the helper's instructions. The built-in safety and communication rules always take priority."
      />

      <Spacer size="sm" />
      <Heading>When you can't talk</Heading>
      <Small>
        What the helper says for each one-tap reason. Use {'{name}'} for the family member's name and {'{patient}'} for theirs. Leave blank
        to use the default shown.
      </Small>
      {UNAVAILABLE_REASON_KEYS.map((key) => (
        <Field
          key={key}
          label={UNAVAILABLE_REASONS[key].label}
          value={responses[key] ?? ''}
          onChangeText={(text) => setResponses((current) => ({ ...current, [key]: text }))}
          placeholder={UNAVAILABLE_REASONS[key].defaultMessage}
          editable={!readOnly}
          multiline
        />
      ))}
      <Field
        label="If nobody answers in time"
        value={noAnswer}
        onChangeText={setNoAnswer}
        placeholder={DEFAULT_NO_ANSWER_MESSAGE}
        editable={!readOnly}
        multiline
      />
      <Field
        label={`How long to wait for an answer (${MIN_CONTACT_REQUEST_TIMEOUT_SECONDS}-${MAX_CONTACT_REQUEST_TIMEOUT_SECONDS} seconds)`}
        value={timeout}
        onChangeText={setTimeoutSeconds}
        keyboardType="number-pad"
        editable={!readOnly}
      />

      <Spacer size="sm" />
      <Heading>Privacy</Heading>
      <ToggleRow
        label="Keep full transcripts"
        description="Off by default. The helper always keeps short session notes for the daily summary; turning this on also stores every line spoken."
        value={storeTranscripts}
        onValueChange={(value) => !readOnly && setStoreTranscripts(value)}
      />

      <ErrorText>{error}</ErrorText>
      {saved ? <Small>Saved. Changes apply the next time their phone starts a conversation.</Small> : null}
      {!readOnly ? <Button label="Save settings" onPress={() => void save()} loading={busy} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
});

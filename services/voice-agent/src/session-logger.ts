import { SESSION_NOTE_SYSTEM_PROMPT, type ConversationEventType, type Json } from '@care/shared';

import { getConfig } from './config.ts';
import type { CircleContext } from './session-context.ts';
import type { AdminClient } from './supabase.ts';

interface TranscriptLine {
  speaker: 'patient' | 'assistant';
  text: string;
  at: Date;
}

/**
 * Records what happened in a session for the caregiver summary.
 *
 * Transcript lines are kept in memory for the end-of-session note and only written to
 * the database when the circle owner has enabled transcript storage. Tool calls,
 * escalations and the final note are always stored.
 */
export class SessionLogger {
  private sessionId: string | null = null;
  private readonly transcript: TranscriptLine[] = [];
  private distressFlagged = false;
  private ended = false;

  constructor(
    private readonly admin: AdminClient,
    private readonly context: CircleContext,
    private readonly roomName: string,
  ) {}

  get id(): string | null {
    return this.sessionId;
  }

  async start(): Promise<void> {
    const { data, error } = await this.admin
      .from('conversation_sessions')
      .insert({ circle_id: this.context.circleId, livekit_room: this.roomName })
      .select('id')
      .single();
    if (error || !data) {
      console.error('[session-logger] could not create session row', error);
      return;
    }
    this.sessionId = data.id;
  }

  recordPatientSaid(text: string): void {
    this.transcript.push({ speaker: 'patient', text, at: new Date() });
    if (this.context.storeTranscripts) {
      void this.writeEvent('user_said', text);
    }
  }

  recordAssistantSaid(text: string): void {
    this.transcript.push({ speaker: 'assistant', text, at: new Date() });
    if (this.context.storeTranscripts) {
      void this.writeEvent('assistant_said', text);
    }
  }

  async recordToolCall(name: string, detail: string, metadata: Record<string, Json | undefined> = {}): Promise<void> {
    await this.writeEvent('tool_call', `${name}: ${detail}`, { tool: name, ...metadata });
  }

  async recordEscalation(level: string, note: string): Promise<void> {
    this.distressFlagged = true;
    await this.writeEvent('escalation', note, { level });
    if (this.sessionId) {
      await this.admin.from('conversation_sessions').update({ distress_flagged: true }).eq('id', this.sessionId);
    }
  }

  /** Closes the session and writes a short note for the family. Safe to call more than once. */
  async end(): Promise<void> {
    if (this.ended) {
      return;
    }
    this.ended = true;
    if (!this.sessionId) {
      return;
    }

    let summary: string | null = null;
    let mood: string | null = null;

    if (this.transcript.length >= 2) {
      try {
        const note = await this.writeSessionNote();
        summary = note.summary;
        mood = note.mood;
        await this.writeEvent('session_note', note.summary, { mood: note.mood });
      } catch (caught) {
        console.error('[session-logger] session note failed', caught);
      }
    }

    await this.admin
      .from('conversation_sessions')
      .update({
        ended_at: new Date().toISOString(),
        summary,
        mood_estimate: mood,
        distress_flagged: this.distressFlagged,
      })
      .eq('id', this.sessionId);
  }

  private async writeEvent(
    type: ConversationEventType,
    content: string,
    metadata: Record<string, Json | undefined> = {},
  ): Promise<void> {
    if (!this.sessionId) {
      return;
    }
    const { error } = await this.admin.from('conversation_events').insert({
      session_id: this.sessionId,
      circle_id: this.context.circleId,
      type,
      content,
      metadata: metadata as Json,
    });
    if (error) {
      console.error('[session-logger] could not write event', type, error);
    }
  }

  private async writeSessionNote(): Promise<{ summary: string; mood: string | null }> {
    const config = getConfig();
    const transcriptText = this.transcript
      .map((line) => `${line.speaker === 'patient' ? this.context.patientPreferredName : 'Helper'}: ${line.text}`)
      .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.SUMMARY_MODEL,
        messages: [
          { role: 'system', content: SESSION_NOTE_SYSTEM_PROMPT },
          { role: 'user', content: transcriptText },
        ],
        max_completion_tokens: 300,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI note request failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    const text = body.choices?.[0]?.message?.content?.trim() ?? '';

    const moodMatch = /Mood:\s*([a-z]+)/i.exec(text);
    const mood = moodMatch?.[1]?.toLowerCase() ?? null;
    const summary = text.replace(/\n?Mood:.*$/i, '').trim() || text;
    return { summary, mood };
  }
}

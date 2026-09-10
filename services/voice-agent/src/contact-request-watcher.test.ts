import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContactRequest } from '@care/shared';

import { waitForRequestResolution } from './contact-request-watcher.ts';
import type { AdminClient } from './supabase.ts';

/**
 * A scripted fake caregiver: the "database" holds one request row, and the test decides
 * when and how the caregiver answers, either through the realtime channel or only via polling.
 */
class FakeSupabase {
  row: ContactRequest;
  private realtimeHandler: ((payload: { new: ContactRequest }) => void) | null = null;
  removedChannels = 0;

  constructor(requestId: string) {
    this.row = {
      id: requestId,
      circle_id: 'circle-1',
      patient_id: 'patient-1',
      target_member_id: 'member-1',
      status: 'pending',
      decline_reason_key: null,
      decline_message: null,
      livekit_room: 'circle-circle-1',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 90_000).toISOString(),
      responded_at: null,
      connected_at: null,
      ended_at: null,
    };
  }

  /** Caregiver taps a button; realtime delivers it (unless the socket is "down"). */
  respond(status: ContactRequest['status'], extra: Partial<ContactRequest> = {}, viaRealtime = true): void {
    this.row = { ...this.row, status, responded_at: new Date().toISOString(), ...extra };
    if (viaRealtime) {
      this.realtimeHandler?.({ new: this.row });
    }
  }

  asClient(): AdminClient {
    const channel = {
      on: (_event: string, _filter: unknown, handler: (payload: { new: ContactRequest }) => void) => {
        this.realtimeHandler = handler;
        return channel;
      },
      subscribe: () => channel,
    };
    return {
      channel: () => channel,
      removeChannel: async () => {
        this.removedChannels += 1;
        return 'ok';
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: this.row, error: null }),
          }),
        }),
      }),
    } as unknown as AdminClient;
  }
}

describe('waitForRequestResolution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when the caregiver accepts over realtime', async () => {
    const fake = new FakeSupabase('req-1');
    const promise = waitForRequestResolution(fake.asClient(), 'req-1', 90_000);
    await vi.advanceTimersByTimeAsync(1_000);

    fake.respond('accepted');
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result?.status).toBe('accepted');
    expect(fake.removedChannels).toBe(1);
  });

  it('delivers the decline reason chosen by the caregiver', async () => {
    const fake = new FakeSupabase('req-2');
    const promise = waitForRequestResolution(fake.asClient(), 'req-2', 90_000);

    fake.respond('declined', { decline_reason_key: 'at_work' });
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result?.status).toBe('declined');
    expect(result?.decline_reason_key).toBe('at_work');
  });

  it('still notices the answer through polling when realtime is silent', async () => {
    const fake = new FakeSupabase('req-3');
    const promise = waitForRequestResolution(fake.asClient(), 'req-3', 90_000);

    // Caregiver answers but the realtime socket never delivers the event.
    fake.respond('accepted', {}, false);
    await vi.advanceTimersByTimeAsync(5_500);

    const result = await promise;
    expect(result?.status).toBe('accepted');
  });

  it('returns null when nobody answers before the timeout', async () => {
    const fake = new FakeSupabase('req-4');
    const promise = waitForRequestResolution(fake.asClient(), 'req-4', 10_000);

    await vi.advanceTimersByTimeAsync(10_500);

    const result = await promise;
    expect(result).toBeNull();
    expect(fake.row.status).toBe('pending');
    expect(fake.removedChannels).toBe(1);
  });

  it('stops waiting when aborted (for example the patient hangs up the session)', async () => {
    const fake = new FakeSupabase('req-5');
    const controller = new AbortController();
    const promise = waitForRequestResolution(fake.asClient(), 'req-5', 90_000, controller.signal);

    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(await promise).toBeNull();
  });
});

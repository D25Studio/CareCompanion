import { describe, expect, it } from 'vitest';

import { CONTACT_REQUEST_STATUSES } from './constants';
import {
  InvalidRequestTransitionError,
  assertTransition,
  canTransition,
  isResolvedForAgent,
  isTerminalStatus,
} from './request-state-machine';

describe('contact request state machine', () => {
  it('allows the happy path pending -> accepted -> connected -> ended', () => {
    expect(canTransition('pending', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'connected')).toBe(true);
    expect(canTransition('connected', 'ended')).toBe(true);
  });

  it('allows decline and expiry from pending', () => {
    expect(canTransition('pending', 'declined')).toBe(true);
    expect(canTransition('pending', 'expired')).toBe(true);
  });

  it('allows an accepted request to expire if the caregiver never joins', () => {
    expect(canTransition('accepted', 'expired')).toBe(true);
  });

  it('rejects skipping straight to connected or reopening terminal states', () => {
    expect(canTransition('pending', 'connected')).toBe(false);
    expect(canTransition('pending', 'ended')).toBe(false);
    expect(canTransition('declined', 'accepted')).toBe(false);
    expect(canTransition('expired', 'pending')).toBe(false);
    expect(canTransition('ended', 'connected')).toBe(false);
  });

  it('never allows a self transition', () => {
    for (const status of CONTACT_REQUEST_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('identifies terminal statuses', () => {
    expect(isTerminalStatus('declined')).toBe(true);
    expect(isTerminalStatus('expired')).toBe(true);
    expect(isTerminalStatus('ended')).toBe(true);
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('accepted')).toBe(false);
    expect(isTerminalStatus('connected')).toBe(false);
  });

  it('treats anything other than pending as resolved for the agent wait loop', () => {
    expect(isResolvedForAgent('pending')).toBe(false);
    expect(isResolvedForAgent('accepted')).toBe(true);
    expect(isResolvedForAgent('declined')).toBe(true);
  });

  it('throws a descriptive error for invalid transitions', () => {
    expect(() => assertTransition('declined', 'accepted')).toThrow(InvalidRequestTransitionError);
    expect(() => assertTransition('declined', 'accepted')).toThrow(
      'Contact request cannot move from "declined" to "accepted".',
    );
    expect(() => assertTransition('pending', 'accepted')).not.toThrow();
  });
});

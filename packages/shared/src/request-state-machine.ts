import type { ContactRequestStatus } from './constants';

/**
 * Allowed transitions for a contact request.
 *
 *   pending  -> accepted | declined | expired
 *   accepted -> connected | expired   (caregiver accepted but never joined)
 *   connected -> ended
 *
 * declined / expired / ended are terminal.
 */
const TRANSITIONS: Record<ContactRequestStatus, readonly ContactRequestStatus[]> = {
  pending: ['accepted', 'declined', 'expired'],
  accepted: ['connected', 'expired'],
  connected: ['ended'],
  declined: [],
  expired: [],
  ended: [],
};

export const TERMINAL_REQUEST_STATUSES: readonly ContactRequestStatus[] = ['declined', 'expired', 'ended'];

export function canTransition(from: ContactRequestStatus, to: ContactRequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: ContactRequestStatus): boolean {
  return TERMINAL_REQUEST_STATUSES.includes(status);
}

/** A status the agent should stop waiting on and speak an outcome for. */
export function isResolvedForAgent(status: ContactRequestStatus): boolean {
  return status !== 'pending';
}

export class InvalidRequestTransitionError extends Error {
  constructor(
    public readonly from: ContactRequestStatus,
    public readonly to: ContactRequestStatus,
  ) {
    super(`Contact request cannot move from "${from}" to "${to}".`);
    this.name = 'InvalidRequestTransitionError';
  }
}

export function assertTransition(from: ContactRequestStatus, to: ContactRequestStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidRequestTransitionError(from, to);
  }
}

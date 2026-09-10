import { describe, expect, it } from 'vitest';

import {
  caregiverIdentity,
  circleIdFromRoomName,
  fillMessageTemplate,
  isCaregiverIdentity,
  isPatientIdentity,
  patientIdentity,
  roomNameForCircle,
} from './constants';
import { decodeAgentMessage, decodeCompanionMessage, encodeDataMessage } from './data-messages';

describe('room and identity helpers', () => {
  it('round trips a circle id through the room name', () => {
    const circleId = '0b6c5d1e-1111-4222-8333-444455556666';
    expect(circleIdFromRoomName(roomNameForCircle(circleId))).toBe(circleId);
  });

  it('returns null for unknown room names', () => {
    expect(circleIdFromRoomName('lobby')).toBeNull();
  });

  it('distinguishes patient and caregiver identities', () => {
    expect(isPatientIdentity(patientIdentity('abc'))).toBe(true);
    expect(isCaregiverIdentity(patientIdentity('abc'))).toBe(false);
    expect(isCaregiverIdentity(caregiverIdentity('abc'))).toBe(true);
  });
});

describe('fillMessageTemplate', () => {
  it('replaces every placeholder occurrence', () => {
    const text = fillMessageTemplate('{name} is at work. {name} will call {patient} later.', {
      name: 'Sarah',
      patient: 'Bob',
    });
    expect(text).toBe('Sarah is at work. Sarah will call Bob later.');
  });
});

describe('data messages', () => {
  it('encodes and decodes agent messages', () => {
    const payload = encodeDataMessage({ type: 'caption', text: 'Hello Bob', final: true });
    expect(decodeAgentMessage(payload)).toEqual({ type: 'caption', text: 'Hello Bob', final: true });
  });

  it('encodes and decodes companion messages', () => {
    const payload = encodeDataMessage({ type: 'hang_up', requestId: 'r1' });
    expect(decodeCompanionMessage(payload)).toEqual({ type: 'hang_up', requestId: 'r1' });
  });

  it('returns null for malformed payloads', () => {
    expect(decodeAgentMessage(new TextEncoder().encode('not json'))).toBeNull();
    expect(decodeCompanionMessage(new TextEncoder().encode('{"type":"unknown"}'))).toBeNull();
  });
});

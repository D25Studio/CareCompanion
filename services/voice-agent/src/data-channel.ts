import type { Room } from '@livekit/rtc-node';

import { DATA_TOPIC, type AgentToCompanionMessage, encodeDataMessage } from '@care/shared';

/**
 * Sends UI messages to the Companion app over the LiveKit data channel.
 * Messages are reliable and addressed to the patient only, so a caregiver on a call
 * never receives patient-screen instructions.
 */
export class DataChannel {
  constructor(
    private readonly room: Room,
    private readonly patientIdentity: string,
  ) {}

  async send(message: AgentToCompanionMessage): Promise<void> {
    // Console mode runs without a room, so there is no data channel to publish on.
    if (!this.room.isConnected) {
      return;
    }
    const local = this.room.localParticipant;
    if (!local) {
      return;
    }
    try {
      await local.publishData(encodeDataMessage(message), {
        reliable: true,
        topic: DATA_TOPIC,
        destination_identities: [this.patientIdentity],
      });
    } catch (caught) {
      console.warn('[data-channel] failed to send', message.type, caught);
    }
  }
}

import * as Speech from 'expo-speech';

/**
 * On-device speech used only when the voice agent cannot be reached. Slow rate and
 * short sentences match the way the agent talks so the change is not jarring.
 */
export function speakFallback(text: string): void {
  Speech.stop();
  Speech.speak(text, {
    language: 'en-AU',
    rate: 0.85,
    pitch: 1.0,
  });
}

export const FALLBACK_MESSAGES = {
  connecting: 'Hello. One moment while I get ready.',
  trouble: 'I am having a little trouble hearing right now. Let us try again in a moment.',
  offline: 'The phone is not connected to the internet right now. Your family knows how to fix this. You are safe.',
  notPaired: 'This phone is almost ready. A family member just needs to finish setting it up.',
  agentMissing: 'I am having trouble starting up. Give me a moment and I will try again.',
} as const;

export function stopFallbackSpeech(): void {
  Speech.stop();
}

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ensurePatientUser,
  getOwnCircle,
  type PairingCode,
  requestPairingCode,
  watchForPairing,
} from '@/lib/patient-session';

export type BootstrapState =
  | { kind: 'loading' }
  | { kind: 'needs_pairing'; pairing: PairingCode; alreadyPaired: boolean }
  | { kind: 'ready'; circleId: string }
  | { kind: 'error'; message: string };

interface Bootstrap {
  state: BootstrapState;
  retry: () => void;
  /** Family member long-pressed the header on an already-paired phone to add another caregiver. */
  showNewPairingCode: () => void;
  /** Leave the pairing screen without pairing (only when already paired). */
  cancelPairing: () => void;
}

/**
 * Decides which of the two patient screens to show:
 * a pairing code (first launch, or when a family member asks for one) or the conversation.
 */
export function usePatientBootstrap(): Bootstrap {
  const [state, setState] = useState<BootstrapState>({ kind: 'loading' });
  const stopWatching = useRef<(() => void) | null>(null);
  const pairedCircleId = useRef<string | null>(null);

  const stopWatch = () => {
    stopWatching.current?.();
    stopWatching.current = null;
  };

  const startPairing = useCallback(async (alreadyPaired: boolean) => {
    const pairing = await requestPairingCode();
    setState({ kind: 'needs_pairing', pairing, alreadyPaired });
    stopWatch();
    stopWatching.current = watchForPairing(pairing.circleId, () => {
      stopWatch();
      pairedCircleId.current = pairing.circleId;
      setState({ kind: 'ready', circleId: pairing.circleId });
    });
  }, []);

  const run = useCallback(async () => {
    stopWatch();
    setState({ kind: 'loading' });
    try {
      await ensurePatientUser();
      const circle = await getOwnCircle();
      if (circle?.owner_id) {
        pairedCircleId.current = circle.id;
        setState({ kind: 'ready', circleId: circle.id });
        return;
      }
      await startPairing(false);
    } catch (caught) {
      setState({ kind: 'error', message: caught instanceof Error ? caught.message : String(caught) });
    }
  }, [startPairing]);

  useEffect(() => {
    void run();
    return () => stopWatch();
  }, [run]);

  // Pairing codes expire; refresh automatically so the screen never shows a dead code.
  useEffect(() => {
    if (state.kind !== 'needs_pairing') {
      return;
    }
    const msUntilExpiry = state.pairing.expiresAt.getTime() - Date.now() - 10_000;
    const alreadyPaired = state.alreadyPaired;
    const timer = setTimeout(() => {
      void startPairing(alreadyPaired).catch((caught) =>
        setState({ kind: 'error', message: caught instanceof Error ? caught.message : String(caught) }),
      );
    }, Math.max(5_000, msUntilExpiry));
    return () => clearTimeout(timer);
  }, [state, startPairing]);

  const showNewPairingCode = useCallback(() => {
    void startPairing(true).catch((caught) =>
      setState({ kind: 'error', message: caught instanceof Error ? caught.message : String(caught) }),
    );
  }, [startPairing]);

  const cancelPairing = useCallback(() => {
    stopWatch();
    if (pairedCircleId.current) {
      setState({ kind: 'ready', circleId: pairedCircleId.current });
    } else {
      void run();
    }
  }, [run]);

  return { state, retry: () => void run(), showNewPairingCode, cancelPairing };
}

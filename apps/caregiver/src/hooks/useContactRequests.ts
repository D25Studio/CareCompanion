import { useCallback, useEffect, useState } from 'react';

import type { ContactRequest } from '@care/shared';

import { supabase } from '@/lib/supabase';

const HISTORY_LIMIT = 50;

/** Live list of contact requests for a circle: realtime inserts/updates plus a refresh on focus. */
export function useContactRequests(circleId: string | null) {
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!circleId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('contact_requests')
      .select('*')
      .eq('circle_id', circleId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    setRequests(data ?? []);
    setLoading(false);
  }, [circleId]);

  useEffect(() => {
    void refresh();
    if (!circleId) {
      return;
    }

    const channel = supabase
      .channel(`requests-${circleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_requests', filter: `circle_id=eq.${circleId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const removed = payload.old as { id: string };
            setRequests((previous) => previous.filter((request) => request.id !== removed.id));
            return;
          }
          const row = payload.new as ContactRequest;
          setRequests((previous) => {
            const index = previous.findIndex((request) => request.id === row.id);
            if (index === -1) {
              return [row, ...previous].slice(0, HISTORY_LIMIT);
            }
            const next = [...previous];
            next[index] = row;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [circleId, refresh]);

  const pending = requests.filter((request) => request.status === 'pending');
  const active = requests.filter((request) => request.status === 'accepted' || request.status === 'connected');
  const history = requests.filter(
    (request) => request.status !== 'pending' && request.status !== 'accepted' && request.status !== 'connected',
  );

  return { requests, pending, active, history, loading, refresh };
}

export function useContactRequest(requestId: string | null) {
  const [request, setRequest] = useState<ContactRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      return;
    }
    let mounted = true;

    void supabase
      .from('contact_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted) {
          setRequest(data ?? null);
          setLoading(false);
        }
      });

    const channel = supabase
      .channel(`request-${requestId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contact_requests', filter: `id=eq.${requestId}` },
        (payload) => setRequest(payload.new as ContactRequest),
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [requestId]);

  return { request, loading };
}

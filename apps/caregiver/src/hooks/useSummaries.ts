import { useCallback, useEffect, useState } from 'react';

import type { Alert, DailySummary } from '@care/shared';

import { supabase } from '@/lib/supabase';

const SUMMARY_LIMIT = 30;
const ALERT_LIMIT = 50;

/** Daily summaries and the alerts feed for a circle, kept live via realtime. */
export function useSummaries(circleId: string | null) {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!circleId) {
      setSummaries([]);
      setAlerts([]);
      setLoading(false);
      return;
    }
    const [{ data: summaryRows }, { data: alertRows }] = await Promise.all([
      supabase
        .from('daily_summaries')
        .select('*')
        .eq('circle_id', circleId)
        .order('summary_date', { ascending: false })
        .limit(SUMMARY_LIMIT),
      supabase.from('alerts').select('*').eq('circle_id', circleId).order('created_at', { ascending: false }).limit(ALERT_LIMIT),
    ]);
    setSummaries(summaryRows ?? []);
    setAlerts(alertRows ?? []);
    setLoading(false);
  }, [circleId]);

  useEffect(() => {
    void refresh();
    if (!circleId) {
      return;
    }
    const channel = supabase
      .channel(`summaries-${circleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `circle_id=eq.${circleId}` }, () => {
        void refresh();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_summaries', filter: `circle_id=eq.${circleId}` },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [circleId, refresh]);

  const acknowledgeAlert = useCallback(
    async (alertId: string) => {
      const { data: user } = await supabase.auth.getUser();
      await supabase
        .from('alerts')
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user.user?.id ?? null })
        .eq('id', alertId);
      await refresh();
    },
    [refresh],
  );

  const unacknowledged = alerts.filter((alert) => !alert.acknowledged_at);

  return { summaries, alerts, unacknowledged, loading, refresh, acknowledgeAlert };
}

import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import type { Alert } from '@care/shared';

import { Body, Button, Card, Heading, Loading, Small } from '@/components/ui';
import { useSummaries } from '@/hooks/useSummaries';
import { formatDate, formatRelative } from '@/lib/format';
import { useCircle } from '@/providers/CircleProvider';
import { spacing } from '@/theme';

/** Daily summaries plus the alerts feed. Urgent, unacknowledged alerts float to the top. */
export default function Summaries() {
  const { circle, settings } = useCircle();
  const { summaries, alerts, unacknowledged, loading, refresh, acknowledgeAlert } = useSummaries(circle?.id ?? null);
  const patientName = settings?.preferred_name || 'your family member';

  if (loading) {
    return <Loading label="Loading summaries" />;
  }

  const acknowledged = alerts.filter((alert) => alert.acknowledged_at);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} />}
    >
      {unacknowledged.length > 0 ? (
        <>
          <Heading>Needs your attention</Heading>
          {unacknowledged.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onAcknowledge={() => void acknowledgeAlert(alert.id)} />
          ))}
        </>
      ) : null}

      <Heading>Daily summaries</Heading>
      {summaries.length === 0 ? (
        <Card>
          <Body muted>
            Each evening you will get a short summary of how {patientName}'s day went: mood, what they talked about, who they
            asked for and anything to keep an eye on.
          </Body>
        </Card>
      ) : (
        summaries.map((summary) => (
          <Card key={summary.id}>
            <Heading>{formatDate(summary.summary_date)}</Heading>
            <Body>{summary.summary_text}</Body>
            <Small>
              {summary.session_count} {summary.session_count === 1 ? 'conversation' : 'conversations'}, {summary.request_count}{' '}
              {summary.request_count === 1 ? 'contact request' : 'contact requests'}
            </Small>
          </Card>
        ))
      )}

      {acknowledged.length > 0 ? (
        <>
          <Heading>Earlier alerts</Heading>
          {acknowledged.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function AlertCard({ alert, onAcknowledge }: { alert: Alert; onAcknowledge?: () => void }) {
  const tone = alert.level === 'high' ? 'danger' : alert.level === 'medium' ? 'warning' : undefined;
  const title = alert.level === 'high' ? 'Urgent' : alert.level === 'medium' ? 'Unsettled' : 'Note';
  return (
    <Card tone={tone}>
      <Heading>{title}</Heading>
      <Body>{alert.note}</Body>
      <Small>{formatRelative(alert.created_at)}</Small>
      {onAcknowledge ? <Button label="Mark as seen" variant="ghost" onPress={onAcknowledge} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});

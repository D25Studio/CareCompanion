import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ContactRequest } from '@care/shared';

import { Body, Card, Heading, Loading, Small } from '@/components/ui';
import { useContactRequests } from '@/hooks/useContactRequests';
import { formatRelative, statusLabel } from '@/lib/format';
import { useCircle } from '@/providers/CircleProvider';
import { colors, spacing } from '@/theme';

export default function Requests() {
  const router = useRouter();
  const { circle, members, settings } = useCircle();
  const { pending, active, history, loading, refresh } = useContactRequests(circle?.id ?? null);
  const patientName = settings?.preferred_name || 'Your family member';

  const memberName = (request: ContactRequest) => {
    const member = members.find((candidate) => candidate.id === request.target_member_id);
    if (!member) {
      return 'a family member';
    }
    return member.profile?.display_name ? `${member.profile.display_name} (${member.relationship_label})` : member.relationship_label;
  };

  if (loading) {
    return <Loading label="Loading requests" />;
  }

  const open = [...active, ...pending];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} />}
    >
      {open.length === 0 ? (
        <Card>
          <Heading>All quiet</Heading>
          <Body muted>When {patientName} asks the helper to reach someone, the request appears here and you get a notification.</Body>
        </Card>
      ) : (
        open.map((request) => (
          <Pressable
            key={request.id}
            accessibilityRole="button"
            accessibilityLabel={`${patientName} wants to talk to ${memberName(request)}. ${statusLabel(request.status)}`}
            onPress={() => router.push({ pathname: '/request/[id]', params: { id: request.id } })}
          >
            <Card tone={request.status === 'pending' ? 'warning' : 'success'}>
              <Heading>{patientName} wants to talk</Heading>
              <Body>To {memberName(request)}</Body>
              <View style={styles.rowBetween}>
                <Text style={[styles.status, request.status === 'pending' ? styles.pending : styles.active]}>
                  {statusLabel(request.status)}
                </Text>
                <Small>{formatRelative(request.created_at)}</Small>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      {history.length > 0 ? (
        <>
          <Heading>Earlier</Heading>
          {history.map((request) => (
            <Pressable
              key={request.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/request/[id]', params: { id: request.id } })}
            >
              <Card>
                <View style={styles.rowBetween}>
                  <Body>{memberName(request)}</Body>
                  <Small>{formatRelative(request.created_at)}</Small>
                </View>
                <Small>{statusLabel(request.status, request.decline_reason_key)}</Small>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontWeight: '700' },
  pending: { color: colors.pending },
  active: { color: colors.success },
});

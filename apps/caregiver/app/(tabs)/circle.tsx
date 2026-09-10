import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Body, Button, Card, Heading, Loading, Small } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useCircle } from '@/providers/CircleProvider';
import { spacing } from '@/theme';

/** Who is in the circle, who can be called, and how to add someone. */
export default function Circle() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { circle, members, settings, isOwner, loading, refresh } = useCircle();
  const patientName = settings?.preferred_name || 'Your family member';

  if (loading) {
    return <Loading />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} />}
    >
      <Card>
        <Heading>{circle?.name ?? 'Care circle'}</Heading>
        <Body muted>
          The helper on {patientName}'s phone can reach the people below. It listens for the relationship word, so "wife" means the
          helper will act when they say "I want to talk to my wife".
        </Body>
      </Card>

      <Heading>Family members</Heading>
      {members.map((member) => (
        <Pressable
          key={member.id}
          accessibilityRole="button"
          accessibilityLabel={`${member.profile?.display_name ?? 'Member'}, ${member.relationship_label}`}
          onPress={() => (isOwner ? router.push({ pathname: '/member/[id]', params: { id: member.id } }) : undefined)}
        >
          <Card>
            <Heading>
              {member.profile?.display_name || 'Family member'}
              {member.is_owner ? '  (owner)' : ''}
            </Heading>
            <Body>Their {member.relationship_label}</Body>
            <Small>
              {member.can_receive_calls ? 'Can be contacted' : 'Not contactable right now'}
              {member.quiet_hours_start && member.quiet_hours_end
                ? ` - quiet ${member.quiet_hours_start.slice(0, 5)} to ${member.quiet_hours_end.slice(0, 5)}`
                : ''}
            </Small>
            {isOwner ? <Small>Tap to edit</Small> : null}
          </Card>
        </Pressable>
      ))}

      <Card>
        <Heading>Add another family member</Heading>
        <Body muted>
          Ask them to install the Caregiver app and create an account. Then open the Companion app on {patientName}'s phone: if it
          is already connected, hold the screen for five seconds to show a new code, and have them enter it.
        </Body>
        <Button label="I have a code" variant="ghost" onPress={() => router.push('/onboarding/pair')} />
      </Card>

      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});

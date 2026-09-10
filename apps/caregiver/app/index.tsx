import { Redirect } from 'expo-router';

import { Loading, Screen } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useCircle } from '@/providers/CircleProvider';

/** Entry gate: sign in -> pair a phone -> main tabs. */
export default function Index() {
  const auth = useAuth();
  const circle = useCircle();

  if (auth.loading || (auth.session && circle.loading)) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!auth.session) {
    return <Redirect href="/(auth)/sign-in" />;
  }
  if (!circle.circle) {
    return <Redirect href="/onboarding/pair" />;
  }
  return <Redirect href="/(tabs)/requests" />;
}

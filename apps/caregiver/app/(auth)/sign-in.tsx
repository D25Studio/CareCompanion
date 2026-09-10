import { Link, useRouter } from 'expo-router';
import { useState } from 'react';

import { Body, Button, ErrorText, Field, Screen, Spacer, Title } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export default function SignIn() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Welcome back</Title>
      <Body muted>Sign in to see requests, settings and daily summaries for your family member.</Body>
      <Spacer size="sm" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        onSubmitEditing={() => void submit()}
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Sign in" onPress={() => void submit()} loading={busy} disabled={!email || !password} />
      <Link href="/(auth)/sign-up" asChild>
        <Button label="Create an account" variant="ghost" onPress={() => undefined} />
      </Link>
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Body, Button, ErrorText, Field, Screen, Spacer, Title } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

const MIN_PASSWORD_LENGTH = 8;

export default function SignUp() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Please use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      await signUp(email, password, displayName);
      router.replace('/');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Create your account</Title>
      <Body muted>
        Your first name is what the helper will say to your family member, for example "Sarah is at work right now".
      </Body>
      <Spacer size="sm" />
      <Field label="Your first name" value={displayName} onChangeText={setDisplayName} autoComplete="given-name" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        label="Create account"
        onPress={() => void submit()}
        loading={busy}
        disabled={!displayName.trim() || !email || !password}
      />
    </Screen>
  );
}

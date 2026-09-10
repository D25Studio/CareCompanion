import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useContactRequests } from '@/hooks/useContactRequests';
import { useSummaries } from '@/hooks/useSummaries';
import { useCircle } from '@/providers/CircleProvider';
import { colors } from '@/theme';

/** Simple text-based tab icons keep the dependency list small; swap for an icon set later. */
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.icon}>
      <Text style={[styles.iconText, focused && styles.iconTextFocused]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { circle } = useCircle();
  const { pending, active } = useContactRequests(circle?.id ?? null);
  const { unacknowledged } = useSummaries(circle?.id ?? null);
  const requestBadge = pending.length + active.length;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          tabBarBadge: requestBadge > 0 ? requestBadge : undefined,
          tabBarIcon: ({ focused }) => <TabIcon label="Call" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="summaries"
        options={{
          title: 'Summaries',
          tabBarBadge: unacknowledged.length > 0 ? unacknowledged.length : undefined,
          tabBarIcon: ({ focused }) => <TabIcon label="Day" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="circle"
        options={{ title: 'Family', tabBarIcon: ({ focused }) => <TabIcon label="Fam" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ focused }) => <TabIcon label="Set" focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  iconTextFocused: { color: colors.primary },
});

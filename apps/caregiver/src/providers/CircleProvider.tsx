import { type PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { CareCircle, CareCircleMember, PatientSettings, Profile } from '@care/shared';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export interface MemberWithProfile extends CareCircleMember {
  profile: Pick<Profile, 'id' | 'display_name'> | null;
}

interface CircleContextValue {
  loading: boolean;
  circle: CareCircle | null;
  members: MemberWithProfile[];
  settings: PatientSettings | null;
  myMembership: MemberWithProfile | null;
  isOwner: boolean;
  refresh: () => Promise<void>;
}

const CircleContext = createContext<CircleContextValue | null>(null);

/**
 * Loads the caregiver's circle (MVP: one circle per caregiver, the first membership).
 * Settings and members are refreshed on demand and when the circle row changes.
 */
export function CircleProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [loading, setLoading] = useState(true);
  const [circle, setCircle] = useState<CareCircle | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [settings, setSettings] = useState<PatientSettings | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCircle(null);
      setMembers([]);
      setSettings(null);
      setLoading(false);
      return;
    }

    const { data: membership } = await supabase
      .from('care_circle_members')
      .select('circle_id')
      .eq('caregiver_id', userId)
      .order('created_at')
      .limit(1)
      .maybeSingle();

    if (!membership) {
      setCircle(null);
      setMembers([]);
      setSettings(null);
      setLoading(false);
      return;
    }

    const circleId = membership.circle_id;
    const [{ data: circleRow }, { data: memberRows }, { data: settingsRow }] = await Promise.all([
      supabase.from('care_circles').select('*').eq('id', circleId).maybeSingle(),
      supabase.from('care_circle_members').select('*').eq('circle_id', circleId).order('created_at'),
      supabase.from('patient_settings').select('*').eq('circle_id', circleId).maybeSingle(),
    ]);

    const caregiverIds = (memberRows ?? []).map((member) => member.caregiver_id);
    const { data: profiles } =
      caregiverIds.length > 0
        ? await supabase.from('profiles').select('id, display_name').in('id', caregiverIds)
        : { data: [] as Pick<Profile, 'id' | 'display_name'>[] };
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    setCircle(circleRow ?? null);
    setMembers((memberRows ?? []).map((member) => ({ ...member, profile: profileById.get(member.caregiver_id) ?? null })));
    setSettings(settingsRow ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const value = useMemo<CircleContextValue>(() => {
    const myMembership = members.find((member) => member.caregiver_id === userId) ?? null;
    return {
      loading,
      circle,
      members,
      settings,
      myMembership,
      isOwner: myMembership?.is_owner ?? false,
      refresh,
    };
  }, [loading, circle, members, settings, userId, refresh]);

  return <CircleContext.Provider value={value}>{children}</CircleContext.Provider>;
}

export function useCircle(): CircleContextValue {
  const value = useContext(CircleContext);
  if (!value) {
    throw new Error('useCircle must be used inside CircleProvider');
  }
  return value;
}

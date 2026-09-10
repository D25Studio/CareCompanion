/**
 * Supabase database types for the `public` schema.
 *
 * Hand-authored to match supabase/migrations. After schema changes, regenerate with:
 *   supabase gen types typescript --project-id <id> --schema public > packages/shared/src/database.types.ts
 * and re-apply the aliases at the bottom of this file.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: Database['public']['Enums']['profile_role'];
          display_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          role: Database['public']['Enums']['profile_role'];
          display_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: Database['public']['Enums']['profile_role'];
          display_name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      care_circles: {
        Row: {
          id: string;
          patient_id: string;
          owner_id: string | null;
          name: string;
          pairing_code: string | null;
          pairing_code_expires_at: string | null;
          paired_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          owner_id?: string | null;
          name?: string;
          pairing_code?: string | null;
          pairing_code_expires_at?: string | null;
          paired_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          owner_id?: string | null;
          name?: string;
          pairing_code?: string | null;
          pairing_code_expires_at?: string | null;
          paired_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      care_circle_members: {
        Row: {
          id: string;
          circle_id: string;
          caregiver_id: string;
          relationship_label: string;
          is_owner: boolean;
          can_receive_calls: boolean;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          caregiver_id: string;
          relationship_label: string;
          is_owner?: boolean;
          can_receive_calls?: boolean;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          caregiver_id?: string;
          relationship_label?: string;
          is_owner?: boolean;
          can_receive_calls?: boolean;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      patient_settings: {
        Row: {
          circle_id: string;
          preferred_name: string;
          condition: Database['public']['Enums']['dementia_condition'];
          stage: Database['public']['Enums']['dementia_stage'];
          assistant_name: string;
          assistant_voice: string;
          speaking_rate: number;
          orientation_facts: Json;
          custom_guidance: string | null;
          unavailable_responses: Json;
          no_answer_message: string | null;
          request_timeout_seconds: number;
          store_transcripts: boolean;
          updated_at: string;
        };
        Insert: {
          circle_id: string;
          preferred_name?: string;
          condition?: Database['public']['Enums']['dementia_condition'];
          stage?: Database['public']['Enums']['dementia_stage'];
          assistant_name?: string;
          assistant_voice?: string;
          speaking_rate?: number;
          orientation_facts?: Json;
          custom_guidance?: string | null;
          unavailable_responses?: Json;
          no_answer_message?: string | null;
          request_timeout_seconds?: number;
          store_transcripts?: boolean;
          updated_at?: string;
        };
        Update: {
          circle_id?: string;
          preferred_name?: string;
          condition?: Database['public']['Enums']['dementia_condition'];
          stage?: Database['public']['Enums']['dementia_stage'];
          assistant_name?: string;
          assistant_voice?: string;
          speaking_rate?: number;
          orientation_facts?: Json;
          custom_guidance?: string | null;
          unavailable_responses?: Json;
          no_answer_message?: string | null;
          request_timeout_seconds?: number;
          store_transcripts?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      contact_requests: {
        Row: {
          id: string;
          circle_id: string;
          patient_id: string;
          target_member_id: string;
          status: Database['public']['Enums']['contact_request_status'];
          decline_reason_key: string | null;
          decline_message: string | null;
          livekit_room: string;
          created_at: string;
          expires_at: string;
          responded_at: string | null;
          connected_at: string | null;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          circle_id: string;
          patient_id: string;
          target_member_id: string;
          status?: Database['public']['Enums']['contact_request_status'];
          decline_reason_key?: string | null;
          decline_message?: string | null;
          livekit_room: string;
          created_at?: string;
          expires_at: string;
          responded_at?: string | null;
          connected_at?: string | null;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          circle_id?: string;
          patient_id?: string;
          target_member_id?: string;
          status?: Database['public']['Enums']['contact_request_status'];
          decline_reason_key?: string | null;
          decline_message?: string | null;
          livekit_room?: string;
          created_at?: string;
          expires_at?: string;
          responded_at?: string | null;
          connected_at?: string | null;
          ended_at?: string | null;
        };
        Relationships: [];
      };
      conversation_sessions: {
        Row: {
          id: string;
          circle_id: string;
          livekit_room: string;
          started_at: string;
          ended_at: string | null;
          mood_estimate: string | null;
          distress_flagged: boolean;
          summary: string | null;
        };
        Insert: {
          id?: string;
          circle_id: string;
          livekit_room: string;
          started_at?: string;
          ended_at?: string | null;
          mood_estimate?: string | null;
          distress_flagged?: boolean;
          summary?: string | null;
        };
        Update: {
          id?: string;
          circle_id?: string;
          livekit_room?: string;
          started_at?: string;
          ended_at?: string | null;
          mood_estimate?: string | null;
          distress_flagged?: boolean;
          summary?: string | null;
        };
        Relationships: [];
      };
      conversation_events: {
        Row: {
          id: string;
          session_id: string;
          circle_id: string;
          type: Database['public']['Enums']['conversation_event_type'];
          content: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          circle_id: string;
          type: Database['public']['Enums']['conversation_event_type'];
          content: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          circle_id?: string;
          type?: Database['public']['Enums']['conversation_event_type'];
          content?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_summaries: {
        Row: {
          id: string;
          circle_id: string;
          summary_date: string;
          summary_text: string;
          request_count: number;
          session_count: number;
          flags: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          circle_id: string;
          summary_date: string;
          summary_text: string;
          request_count?: number;
          session_count?: number;
          flags?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          circle_id?: string;
          summary_date?: string;
          summary_text?: string;
          request_count?: number;
          session_count?: number;
          flags?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      alerts: {
        Row: {
          id: string;
          circle_id: string;
          session_id: string | null;
          level: Database['public']['Enums']['distress_level'];
          note: string;
          created_at: string;
          acknowledged_at: string | null;
          acknowledged_by: string | null;
        };
        Insert: {
          id?: string;
          circle_id: string;
          session_id?: string | null;
          level: Database['public']['Enums']['distress_level'];
          note: string;
          created_at?: string;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
        };
        Update: {
          id?: string;
          circle_id?: string;
          session_id?: string | null;
          level?: Database['public']['Enums']['distress_level'];
          note?: string;
          created_at?: string;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          id: string;
          profile_id: string;
          expo_push_token: string;
          platform: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          expo_push_token: string;
          platform?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          expo_push_token?: string;
          platform?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_pairing_code: {
        Args: Record<string, never>;
        Returns: {
          circle_id: string;
          pairing_code: string;
          expires_at: string;
        }[];
      };
      redeem_pairing_code: {
        Args: {
          p_code: string;
          p_relationship_label: string;
          p_circle_name: string;
        };
        Returns: string;
      };
      respond_to_contact_request: {
        Args: {
          p_request_id: string;
          p_action: string;
          p_reason_key?: string | null;
          p_message?: string | null;
        };
        Returns: undefined;
      };
      expire_stale_contact_requests: {
        Args: Record<string, never>;
        Returns: number;
      };
      is_circle_member: {
        Args: { p_circle_id: string };
        Returns: boolean;
      };
      is_circle_owner: {
        Args: { p_circle_id: string };
        Returns: boolean;
      };
      is_circle_patient: {
        Args: { p_circle_id: string };
        Returns: boolean;
      };
      register_push_token: {
        Args: { p_token: string; p_platform?: string | null };
        Returns: undefined;
      };
      invoke_daily_summary: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: {
      profile_role: 'patient' | 'caregiver';
      dementia_condition:
        | 'alzheimers'
        | 'vascular'
        | 'lewy_body'
        | 'frontotemporal'
        | 'mixed'
        | 'unspecified';
      dementia_stage: 'early' | 'middle' | 'late' | 'unspecified';
      contact_request_status: 'pending' | 'accepted' | 'declined' | 'expired' | 'connected' | 'ended';
      conversation_event_type: 'user_said' | 'assistant_said' | 'tool_call' | 'escalation' | 'session_note';
      distress_level: 'low' | 'medium' | 'high';
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export type Profile = Tables<'profiles'>;
export type CareCircle = Tables<'care_circles'>;
export type CareCircleMember = Tables<'care_circle_members'>;
export type PatientSettings = Tables<'patient_settings'>;
export type ContactRequest = Tables<'contact_requests'>;
export type ConversationSession = Tables<'conversation_sessions'>;
export type ConversationEvent = Tables<'conversation_events'>;
export type DailySummary = Tables<'daily_summaries'>;
export type Alert = Tables<'alerts'>;
export type PushToken = Tables<'push_tokens'>;

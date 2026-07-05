export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: number
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: never
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: never
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      console_lines: {
        Row: {
          id: number
          server_id: number
          timestamp: string
          line_type: string
          text: string
          source: string
        }
        Insert: {
          id?: never
          server_id: number
          timestamp?: string
          line_type?: string
          text: string
          source?: string
        }
        Update: {
          id?: never
          server_id?: number
          timestamp?: string
          line_type?: string
          text?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "console_lines_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      bans: {
        Row: {
          banned_by: string
          created_at: string
          expires_at: string | null
          id: number
          ip_address: string | null
          player_name: string
          reason: string
          server_id: number
        }
        Insert: {
          banned_by?: string
          created_at?: string
          expires_at?: string | null
          id?: number
          ip_address?: string | null
          player_name: string
          reason?: string
          server_id: number
        }
        Update: {
          banned_by?: string
          created_at?: string
          expires_at?: string | null
          id?: number
          ip_address?: string | null
          player_name?: string
          reason?: string
          server_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "bans_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      map_files: {
        Row: {
          created_at: string
          filename: string
          id: number
          server_id: number
          size_bytes: number
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          filename: string
          id?: number
          server_id: number
          size_bytes?: number
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          filename?: string
          id?: number
          server_id?: number
          size_bytes?: number
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_files_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          cpu_percent: number
          id: number
          memory_mb: number
          player_count: number
          recorded_at: string
          server_id: number
        }
        Insert: {
          cpu_percent?: number
          id?: number
          memory_mb?: number
          player_count?: number
          recorded_at?: string
          server_id: number
        }
        Update: {
          cpu_percent?: number
          id?: number
          memory_mb?: number
          player_count?: number
          recorded_at?: string
          server_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "metrics_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          id: number
          ip_address: string | null
          is_online: boolean
          joined_at: string
          name: string
          ping: number
          score: number
          server_id: number
        }
        Insert: {
          id?: number
          ip_address?: string | null
          is_online?: boolean
          joined_at?: string
          name: string
          ping?: number
          score?: number
          server_id: number
        }
        Update: {
          id?: number
          ip_address?: string | null
          is_online?: boolean
          joined_at?: string
          name?: string
          ping?: number
          score?: number
          server_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "players_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      server_configs: {
        Row: {
          filename: string
          id: number
          key: string
          server_id: number
          updated_at: string
          value: string
        }
        Insert: {
          filename?: string
          id?: number
          key: string
          server_id: number
          updated_at?: string
          value?: string
        }
        Update: {
          filename?: string
          id?: number
          key?: string
          server_id?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_configs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_events: {
        Row: {
          event_type: string
          id: number
          occurred_at: string
          payload: Json | null
          server_id: number
        }
        Insert: {
          event_type: string
          id?: number
          occurred_at?: string
          payload?: Json | null
          server_id: number
        }
        Update: {
          event_type?: string
          id?: number
          occurred_at?: string
          payload?: Json | null
          server_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "server_events_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          agent_token: string | null
          agent_url: string | null
          auto_restart: boolean
          config_dir: string
          cpu_percent: number
          created_at: string
          current_map: string | null
          data_dir: string
          executable_path: string
          id: number
          max_players: number
          memory_mb: number
          name: string
          player_count: number
          port: number
          status: string
          updated_at: string
          uptime: number
        }
        Insert: {
          agent_token?: string | null
          agent_url?: string | null
          auto_restart?: boolean
          config_dir?: string
          cpu_percent?: number
          created_at?: string
          current_map?: string | null
          data_dir?: string
          executable_path?: string
          id?: number
          max_players?: number
          memory_mb?: number
          name: string
          player_count?: number
          port?: number
          status?: string
          updated_at?: string
          uptime?: number
        }
        Update: {
          agent_token?: string | null
          agent_url?: string | null
          auto_restart?: boolean
          config_dir?: string
          cpu_percent?: number
          created_at?: string
          current_map?: string | null
          data_dir?: string
          executable_path?: string
          id?: number
          max_players?: number
          memory_mb?: number
          name?: string
          player_count?: number
          port?: number
          status?: string
          updated_at?: string
          uptime?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "moderator" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "viewer"],
    },
  },
} as const

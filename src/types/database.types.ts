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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      centers: {
        Row: {
          created_at: string
          id: string
          manager_name: string | null
          name: string
          price_currency: string
          price_per_session: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_name?: string | null
          name: string
          price_currency?: string
          price_per_session?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_name?: string | null
          name?: string
          price_currency?: string
          price_per_session?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          cancel_reason: string | null
          conducted_at: string | null
          conducted_override: boolean | null
          course: string
          course_english_title: string | null
          course_title: string
          created_at: string
          end_min: number
          enrollment_id: string
          feedback: string | null
          feedback_at: string | null
          id: string
          is_makeup: boolean
          original_teacher_id: string | null
          session_date: string
          session_no: number
          start_min: number
          status: string
          student_english_name: string | null
          student_id: string
          student_name: string | null
          teacher_entered_at: string | null
          teacher_id: string
          teacher_name: string | null
          teacher_reassigned_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          conducted_at?: string | null
          conducted_override?: boolean | null
          course: string
          course_english_title?: string | null
          course_title: string
          created_at?: string
          end_min: number
          enrollment_id: string
          feedback?: string | null
          feedback_at?: string | null
          id?: string
          is_makeup?: boolean
          original_teacher_id?: string | null
          session_date: string
          session_no: number
          start_min: number
          status?: string
          student_english_name?: string | null
          student_id: string
          student_name?: string | null
          teacher_entered_at?: string | null
          teacher_id: string
          teacher_name?: string | null
          teacher_reassigned_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          conducted_at?: string | null
          conducted_override?: boolean | null
          course?: string
          course_english_title?: string | null
          course_title?: string
          created_at?: string
          end_min?: number
          enrollment_id?: string
          feedback?: string | null
          feedback_at?: string | null
          id?: string
          is_makeup?: boolean
          original_teacher_id?: string | null
          session_date?: string
          session_no?: number
          start_min?: number
          status?: string
          student_english_name?: string | null
          student_id?: string
          student_name?: string | null
          teacher_entered_at?: string | null
          teacher_id?: string
          teacher_name?: string | null
          teacher_reassigned_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          class_id: string | null
          course: string | null
          course_title: string | null
          created_at: string
          detail: Json | null
          enrollment_id: string | null
          event_type: string
          id: string
          student_name: string | null
          teacher_name: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          class_id?: string | null
          course?: string | null
          course_title?: string | null
          created_at?: string
          detail?: Json | null
          enrollment_id?: string | null
          event_type: string
          id?: string
          student_name?: string | null
          teacher_name?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          class_id?: string | null
          course?: string | null
          course_title?: string | null
          created_at?: string
          detail?: Json | null
          enrollment_id?: string | null
          event_type?: string
          id?: string
          student_name?: string | null
          teacher_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_events_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course: string
          course_english_title: string | null
          course_title: string
          created_at: string
          id: string
          is_test: boolean
          slots: Json
          start_date: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_english_name: string | null
          student_id: string
          student_name: string | null
          student_phone: string | null
          teacher_id: string
          teacher_name: string | null
          teacher_note: string | null
          total_sessions: number | null
          updated_at: string
        }
        Insert: {
          course: string
          course_english_title?: string | null
          course_title: string
          created_at?: string
          id?: string
          is_test?: boolean
          slots: Json
          start_date: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_english_name?: string | null
          student_id: string
          student_name?: string | null
          student_phone?: string | null
          teacher_id: string
          teacher_name?: string | null
          teacher_note?: string | null
          total_sessions?: number | null
          updated_at?: string
        }
        Update: {
          course?: string
          course_english_title?: string | null
          course_title?: string
          created_at?: string
          id?: string
          is_test?: boolean
          slots?: Json
          start_date?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_english_name?: string | null
          student_id?: string
          student_name?: string | null
          student_phone?: string | null
          teacher_id?: string
          teacher_name?: string | null
          teacher_note?: string | null
          total_sessions?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          cancelled_amount: number
          created_at: string
          currency: string
          enrollment_id: string | null
          id: string
          method: string | null
          note: string | null
          payment_id: string
          pg_tx_id: string | null
          raw: Json | null
          receipt_url: string | null
          status: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          cancelled_amount?: number
          created_at?: string
          currency?: string
          enrollment_id?: string | null
          id?: string
          method?: string | null
          note?: string | null
          payment_id: string
          pg_tx_id?: string | null
          raw?: Json | null
          receipt_url?: string | null
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cancelled_amount?: number
          created_at?: string
          currency?: string
          enrollment_id?: string | null
          id?: string
          method?: string | null
          note?: string | null
          payment_id?: string
          pg_tx_id?: string | null
          raw?: Json | null
          receipt_url?: string | null
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_verifications: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          last_sent_at: string
          phone: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          last_sent_at?: string
          phone: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          last_sent_at?: string
          phone?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          address_detail: string | null
          avatar_url: string | null
          bio: string | null
          center_id: string | null
          created_at: string
          custom_price_currency: string | null
          custom_price_per_session: number | null
          english_name: string | null
          experience: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string
          last_name: string | null
          nationality: string | null
          phone: string | null
          phone_verified_at: string | null
          postcode: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          zoom_url: string | null
        }
        Insert: {
          address?: string | null
          address_detail?: string | null
          avatar_url?: string | null
          bio?: string | null
          center_id?: string | null
          created_at?: string
          custom_price_currency?: string | null
          custom_price_per_session?: number | null
          english_name?: string | null
          experience?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          last_name?: string | null
          nationality?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          postcode?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          zoom_url?: string | null
        }
        Update: {
          address?: string | null
          address_detail?: string | null
          avatar_url?: string | null
          bio?: string | null
          center_id?: string | null
          created_at?: string
          custom_price_currency?: string | null
          custom_price_per_session?: number | null
          english_name?: string | null
          experience?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          nationality?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          postcode?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          zoom_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_schedules: {
        Row: {
          created_at: string
          currency: string | null
          effective_from: string
          id: string
          note: string | null
          price_per_session: number | null
          scope: string
          scope_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          effective_from: string
          id?: string
          note?: string | null
          price_per_session?: number | null
          scope: string
          scope_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          effective_from?: string
          id?: string
          note?: string | null
          price_per_session?: number | null
          scope?: string
          scope_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          completed: boolean
          course: string
          last_viewed_at: string
          unit: number
          user_id: string
        }
        Insert: {
          completed?: boolean
          course: string
          last_viewed_at?: string
          unit: number
          user_id: string
        }
        Update: {
          completed?: boolean
          course?: string
          last_viewed_at?: string
          unit?: number
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      teacher_applications: {
        Row: {
          admin_note: string | null
          avatar_url: string | null
          bio: string
          center_id: string | null
          created_at: string
          experience: string | null
          first_name: string | null
          gender: string | null
          id: string
          last_name: string | null
          name: string
          nationality: string | null
          phone: string | null
          status: Database["public"]["Enums"]["teacher_application_status"]
          updated_at: string
          user_id: string
          zoom_url: string | null
        }
        Insert: {
          admin_note?: string | null
          avatar_url?: string | null
          bio: string
          center_id?: string | null
          created_at?: string
          experience?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          name: string
          nationality?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["teacher_application_status"]
          updated_at?: string
          user_id: string
          zoom_url?: string | null
        }
        Update: {
          admin_note?: string | null
          avatar_url?: string | null
          bio?: string
          center_id?: string | null
          created_at?: string
          experience?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          name?: string
          nationality?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["teacher_application_status"]
          updated_at?: string
          user_id?: string
          zoom_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_applications_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_availability: {
        Row: {
          created_at: string
          day_of_week: number
          start_min: number
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          start_min: number
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          start_min?: number
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      youtube_videos: {
        Row: {
          created_at: string
          description: string
          id: string
          is_visible: boolean
          sort_order: number
          tag: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_visible?: boolean
          sort_order?: number
          tag?: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_visible?: boolean
          sort_order?: number
          tag?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_teacher_application: {
        Args: { p_app_id: string }
        Returns: string
      }
    }
    Enums: {
      enrollment_status:
        | "신청"
        | "승인"
        | "결제대기"
        | "결제완료"
        | "거절"
        | "취소"
      teacher_application_status: "신청" | "승인" | "거절"
      user_role: "admin" | "teacher" | "student"
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
      enrollment_status: [
        "신청",
        "승인",
        "결제대기",
        "결제완료",
        "거절",
        "취소",
      ],
      teacher_application_status: ["신청", "승인", "거절"],
      user_role: ["admin", "teacher", "student"],
    },
  },
} as const

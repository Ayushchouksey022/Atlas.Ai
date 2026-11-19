/**
 * TypeScript Database definitions representing the PostgreSQL schema in Supabase.
 * Generated matching `supabase gen types typescript` format.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      domains: {
        Row: {
          id: string;
          slug: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: 'editor' | 'admin';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: 'editor' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: 'editor' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          domain_id: string | null;
          experience: Json | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          domain_id?: string | null;
          experience?: Json | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          domain_id?: string | null;
          experience?: Json | null;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_domain_id_fkey';
            columns: ['domain_id'];
            isOneToOne: false;
            referencedRelation: 'domains';
            referencedColumns: ['id'];
          },
        ];
      };
      canonical_nodes: {
        Row: {
          id: string;
          domain_id: string;
          slug: string;
          name: string;
          description: string | null;
          node_type: 'skill' | 'tool' | 'workflow';
          level: number;
          status: 'draft' | 'approved' | 'deprecated';
          external_url: string | null;
          version_tag: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          domain_id: string;
          slug: string;
          name: string;
          description?: string | null;
          node_type: 'skill' | 'tool' | 'workflow';
          level?: number;
          status?: 'draft' | 'approved' | 'deprecated';
          external_url?: string | null;
          version_tag?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          domain_id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          node_type?: 'skill' | 'tool' | 'workflow';
          level?: number;
          status?: 'draft' | 'approved' | 'deprecated';
          external_url?: string | null;
          version_tag?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'canonical_nodes_domain_id_fkey';
            columns: ['domain_id'];
            isOneToOne: false;
            referencedRelation: 'domains';
            referencedColumns: ['id'];
          },
        ];
      };
      canonical_edges: {
        Row: {
          id: string;
          from_node: string;
          to_node: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          from_node: string;
          to_node: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          from_node?: string;
          to_node?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'canonical_edges_from_node_fkey';
            columns: ['from_node'];
            isOneToOne: false;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'canonical_edges_to_node_fkey';
            columns: ['to_node'];
            isOneToOne: false;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
        ];
      };
      node_supersedes: {
        Row: {
          id: string;
          old_node: string;
          new_node: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          old_node: string;
          new_node: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          old_node?: string;
          new_node?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'node_supersedes_old_node_fkey';
            columns: ['old_node'];
            isOneToOne: false;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'node_supersedes_new_node_fkey';
            columns: ['new_node'];
            isOneToOne: false;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
        ];
      };
      user_nodes: {
        Row: {
          id: string;
          user_id: string;
          node_id: string;
          status: 'known' | 'todo' | 'in_progress' | 'completed' | 'archived';
          origin: 'baseline' | 'injection' | 'override';
          fast_track: boolean;
          replaced_node_id: string | null;
          completed_at: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          node_id: string;
          status: 'known' | 'todo' | 'in_progress' | 'completed' | 'archived';
          origin?: 'baseline' | 'injection' | 'override';
          fast_track?: boolean;
          replaced_node_id?: string | null;
          completed_at?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          node_id?: string;
          status?: 'known' | 'todo' | 'in_progress' | 'completed' | 'archived';
          origin?: 'baseline' | 'injection' | 'override';
          fast_track?: boolean;
          replaced_node_id?: string | null;
          completed_at?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_nodes_node_id_fkey';
            columns: ['node_id'];
            isOneToOne: false;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_nodes_replaced_node_id_fkey';
            columns: ['replaced_node_id'];
            isOneToOne: false;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
        ];
      };
      news_sources: {
        Row: {
          id: string;
          domain_id: string;
          name: string;
          url: string;
          kind: 'rss' | 'github_releases' | 'api' | 'newsletter';
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          domain_id: string;
          name: string;
          url: string;
          kind: 'rss' | 'github_releases' | 'api' | 'newsletter';
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          domain_id?: string;
          name?: string;
          url?: string;
          kind?: 'rss' | 'github_releases' | 'api' | 'newsletter';
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'news_sources_domain_id_fkey';
            columns: ['domain_id'];
            isOneToOne: false;
            referencedRelation: 'domains';
            referencedColumns: ['id'];
          },
        ];
      };
      news_items: {
        Row: {
          id: string;
          domain_id: string;
          source_id: string | null;
          url: string;
          title: string;
          published_at: string | null;
          raw_text: string | null;
          content_hash: string;
          bullets: [string, string, string];
          impact_score: number;
          impact_rationale: string | null;
          tags: string[];
          mapped_node_ids: string[];
          proposed_new_tool: Json | null;
          status: 'ingested' | 'processed' | 'published' | 'rejected';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          domain_id: string;
          source_id?: string | null;
          url: string;
          title: string;
          published_at?: string | null;
          raw_text?: string | null;
          content_hash: string;
          bullets: [string, string, string];
          impact_score: number;
          impact_rationale?: string | null;
          tags?: string[];
          mapped_node_ids?: string[];
          proposed_new_tool?: Json | null;
          status?: 'ingested' | 'processed' | 'published' | 'rejected';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          domain_id?: string;
          source_id?: string | null;
          url?: string;
          title?: string;
          published_at?: string | null;
          raw_text?: string | null;
          content_hash?: string;
          bullets?: [string, string, string];
          impact_score?: number;
          impact_rationale?: string | null;
          tags?: string[];
          mapped_node_ids?: string[];
          proposed_new_tool?: Json | null;
          status?: 'ingested' | 'processed' | 'published' | 'rejected';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'news_items_domain_id_fkey';
            columns: ['domain_id'];
            isOneToOne: false;
            referencedRelation: 'domains';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'news_items_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'news_sources';
            referencedColumns: ['id'];
          },
        ];
      };
      verdicts: {
        Row: {
          id: string;
          news_item_id: string;
          cache_key: string;
          verdict: 'shield' | 'injection' | 'override';
          target_node_id: string | null;
          new_node_id: string | null;
          insert_after_node_ids: string[];
          reasoning: string | null;
          confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          news_item_id: string;
          cache_key: string;
          verdict: 'shield' | 'injection' | 'override';
          target_node_id?: string | null;
          new_node_id?: string | null;
          insert_after_node_ids?: string[];
          reasoning?: string | null;
          confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          news_item_id?: string;
          cache_key?: string;
          verdict?: 'shield' | 'injection' | 'override';
          target_node_id?: string | null;
          new_node_id?: string | null;
          insert_after_node_ids?: string[];
          reasoning?: string | null;
          confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'verdicts_new_node_id_fkey';
            columns: ['new_node_id'];
            isOneToOne: false;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'verdicts_news_item_id_fkey';
            columns: ['news_item_id'];
            isOneToOne: false;
            referencedRelation: 'news_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'verdicts_target_node_id_fkey';
            columns: ['target_node_id'];
            isOneToOne: false;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
        ];
      };
      user_verdicts: {
        Row: {
          id: string;
          user_id: string;
          news_item_id: string;
          verdict_id: string;
          state: 'precomputed' | 'previewed' | 'confirmed' | 'dismissed' | 'applied' | 'failed';
          applied_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          news_item_id: string;
          verdict_id: string;
          state: 'precomputed' | 'previewed' | 'confirmed' | 'dismissed' | 'applied' | 'failed';
          applied_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          news_item_id?: string;
          verdict_id?: string;
          state?: 'precomputed' | 'previewed' | 'confirmed' | 'dismissed' | 'applied' | 'failed';
          applied_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_verdicts_news_item_id_fkey';
            columns: ['news_item_id'];
            isOneToOne: false;
            referencedRelation: 'news_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_verdicts_verdict_id_fkey';
            columns: ['verdict_id'];
            isOneToOne: false;
            referencedRelation: 'verdicts';
            referencedColumns: ['id'];
          },
        ];
      };
      guides: {
        Row: {
          id: string;
          node_id: string;
          markdown: string;
          source_urls: string[];
          last_verified_at: string | null;
          status: 'draft' | 'approved';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          node_id: string;
          markdown: string;
          source_urls?: string[];
          last_verified_at?: string | null;
          status?: 'draft' | 'approved';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          node_id?: string;
          markdown?: string;
          source_urls?: string[];
          last_verified_at?: string | null;
          status?: 'draft' | 'approved';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guides_node_id_fkey';
            columns: ['node_id'];
            isOneToOne: true;
            referencedRelation: 'canonical_nodes';
            referencedColumns: ['id'];
          },
        ];
      };
      proposed_graph_changes: {
        Row: {
          id: string;
          news_item_id: string | null;
          change_type: 'add_node' | 'add_edge' | 'add_supersedes' | 'deprecate_node';
          payload: Json;
          status: 'pending' | 'approved' | 'rejected';
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          news_item_id?: string | null;
          change_type: 'add_node' | 'add_edge' | 'add_supersedes' | 'deprecate_node';
          payload?: Json;
          status?: 'pending' | 'approved' | 'rejected';
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          news_item_id?: string | null;
          change_type?: 'add_node' | 'add_edge' | 'add_supersedes' | 'deprecate_node';
          payload?: Json;
          status?: 'pending' | 'approved' | 'rejected';
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'proposed_graph_changes_news_item_id_fkey';
            columns: ['news_item_id'];
            isOneToOne: false;
            referencedRelation: 'news_items';
            referencedColumns: ['id'];
          },
        ];
      };
      sponsored_placements: {
        Row: {
          id: string;
          title: string;
          body: string;
          cta_url: string;
          sponsor_name: string;
          domain_id: string;
          active: boolean;
          starts_at: string | null;
          ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          cta_url: string;
          sponsor_name: string;
          domain_id: string;
          active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          cta_url?: string;
          sponsor_name?: string;
          domain_id?: string;
          active?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sponsored_placements_domain_id_fkey';
            columns: ['domain_id'];
            isOneToOne: false;
            referencedRelation: 'domains';
            referencedColumns: ['id'];
          },
        ];
      };
      usage_counters: {
        Row: {
          user_id: string;
          day: string;
          on_demand_analyses: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          day?: string;
          on_demand_analyses?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          day?: string;
          on_demand_analyses?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          properties: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          properties?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          properties?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_editor: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      delete_user_account: {
        Args: {
          target_user_id: string;
        };
        Returns: void;
      };
    };
    Enums: {
      node_type: 'skill' | 'tool' | 'workflow';
      node_status: 'draft' | 'approved' | 'deprecated';
      user_node_status: 'known' | 'todo' | 'in_progress' | 'completed' | 'archived';
      user_node_origin: 'baseline' | 'injection' | 'override';
      news_source_kind: 'rss' | 'github_releases' | 'api' | 'newsletter';
      news_item_status: 'ingested' | 'processed' | 'published' | 'rejected';
      verdict_type: 'shield' | 'injection' | 'override';
      user_verdict_state: 'precomputed' | 'previewed' | 'confirmed' | 'dismissed' | 'applied' | 'failed';
      guide_status: 'draft' | 'approved';
      graph_change_type: 'add_node' | 'add_edge' | 'add_supersedes' | 'deprecate_node';
      graph_change_status: 'pending' | 'approved' | 'rejected';
      app_role: 'editor' | 'admin';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

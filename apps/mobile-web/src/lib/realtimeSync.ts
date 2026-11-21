import { useEffect, useState, useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuthStore, type Profile } from './authStore';
import type { RoadmapQueryResult } from './useRoadmap';
import { computeNodeVisualStatus } from './roadmapRules';

export type SyncEventType =
  | 'USER_NODE_UPDATED'
  | 'ROADMAP_UPDATED'
  | 'PROFILE_UPDATED'
  | 'VERDICT_UPDATED';

export interface UserNodeUpdatePayload {
  nodeId: string;
  status: string;
  version: number;
  completed_at: string | null;
}

export type SyncEvent =
  | {
      type: 'USER_NODE_UPDATED';
      userId: string;
      payload: UserNodeUpdatePayload;
    }
  | {
      type: 'ROADMAP_UPDATED';
      userId: string;
    }
  | {
      type: 'PROFILE_UPDATED';
      userId: string;
      payload: Partial<Profile>;
    }
  | {
      type: 'VERDICT_UPDATED';
      userId: string;
    };

// BroadcastChannel for instant cross-tab / cross-window sync in browser
const BROADCAST_CHANNEL_NAME = 'atlas_realtime_sync';
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    syncChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  } catch {
    syncChannel = null;
  }
}

/**
 * Broadcasts a sync event to other tabs/windows in the browser.
 */
export function broadcastSyncEvent(event: SyncEvent): void {
  // 1. Post to BroadcastChannel
  if (syncChannel) {
    try {
      syncChannel.postMessage(event);
    } catch {
      // ignore
    }
  }

  // 2. Storage event fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const data = JSON.stringify({ ...event, _t: Date.now() });
      window.localStorage.setItem('__atlas_sync_event__', data);
    } catch {
      // ignore
    }
  }
}

/**
 * Applies a node update directly to the TanStack Query cache.
 */
export function applyNodeUpdateToCache(
  queryClient: QueryClient,
  userId: string,
  update: UserNodeUpdatePayload,
): void {
  const queryKey = ['roadmap', userId];
  const previous = queryClient.getQueryData<RoadmapQueryResult>(queryKey);
  if (!previous) return;

  const { nodeId, status: newStatus, version, completed_at } = update;

  const updatedNodes = previous.nodes.map((n) => {
    if (n.id === nodeId) {
      return {
        ...n,
        status: (newStatus === 'known' ? 'completed' : newStatus) as any,
        completed_at,
        version,
      };
    }
    return n;
  });

  // Recompute downstream statuses
  const userNodeMap = new Map<string, { status: string }>();
  for (const n of updatedNodes) {
    userNodeMap.set(n.id, { status: n.status });
  }

  const recheckedNodes = updatedNodes.map((n) => {
    if (n.status === 'completed' || n.status === 'archived' || n.status === 'in_progress') {
      return n;
    }
    const prereqIds = previous.prereqMap.get(n.id) || [];
    const vis = computeNodeVisualStatus(n.status, prereqIds, userNodeMap);
    return { ...n, status: vis };
  });

  // Recompute stats
  const stats = {
    total: recheckedNodes.length,
    completed: 0,
    available: 0,
    inProgress: 0,
    locked: 0,
    archived: 0,
  };
  for (const n of recheckedNodes) {
    if (n.status === 'completed') stats.completed++;
    else if (n.status === 'available') stats.available++;
    else if (n.status === 'in_progress') stats.inProgress++;
    else if (n.status === 'locked') stats.locked++;
    else if (n.status === 'archived') stats.archived++;
  }

  queryClient.setQueryData<RoadmapQueryResult>(queryKey, {
    ...previous,
    nodes: recheckedNodes,
    stats,
  });
}

/**
 * Subscribes to Supabase Realtime changes and local BroadcastChannel for a given user.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToUserRealtime(
  userId: string,
  queryClient: QueryClient,
  callbacks?: {
    onConnectionChange?: (isOnline: boolean) => void;
    onConflict?: (message: string) => void;
  },
): () => void {
  if (!userId) return () => {};

  // 1. Supabase Realtime channel
  const channelName = `realtime:user:${userId}`;
  const channel = supabase.channel(channelName);

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_nodes',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new && typeof payload.new === 'object') {
          const row = payload.new as Record<string, unknown>;
          const nodeId = String(row.node_id);
          const status = String(row.status);
          const version = Number(row.version) || 1;
          const completed_at = row.completed_at ? String(row.completed_at) : null;

          applyNodeUpdateToCache(queryClient, userId, {
            nodeId,
            status,
            version,
            completed_at,
          });
        } else {
          void queryClient.invalidateQueries({ queryKey: ['roadmap', userId] });
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          const profile = payload.new as Profile;
          useAuthStore.getState().setProfile(profile);
          void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_verdicts',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        void queryClient.invalidateQueries({ queryKey: ['verdicts', userId] });
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        callbacks?.onConnectionChange?.(true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // If navigator is still online, don't immediately declare offline unless network dropped
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          callbacks?.onConnectionChange?.(false);
        }
      }
    });

  // 2. BroadcastChannel listener (Instant cross-tab sync)
  const handleBroadcastMessage = (event: MessageEvent<SyncEvent>) => {
    const data = event.data;
    if (!data || data.userId !== userId) return;

    if (data.type === 'USER_NODE_UPDATED') {
      applyNodeUpdateToCache(queryClient, userId, data.payload);
    } else if (data.type === 'ROADMAP_UPDATED') {
      void queryClient.invalidateQueries({ queryKey: ['roadmap', userId] });
    } else if (data.type === 'PROFILE_UPDATED') {
      const current = useAuthStore.getState().profile;
      if (current) {
        useAuthStore.getState().setProfile({ ...current, ...data.payload });
      }
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    } else if (data.type === 'VERDICT_UPDATED') {
      void queryClient.invalidateQueries({ queryKey: ['verdicts', userId] });
    }
  };

  if (syncChannel) {
    syncChannel.addEventListener('message', handleBroadcastMessage);
  }

  // 3. Storage event listener (fallback for cross-tab sync)
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === '__atlas_sync_event__' && event.newValue) {
      try {
        const data = JSON.parse(event.newValue) as SyncEvent;
        if (data.userId === userId) {
          handleBroadcastMessage({ data } as MessageEvent<SyncEvent>);
        }
      } catch {
        // ignore
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  // 4. Online / Offline listeners
  const handleOnline = () => {
    callbacks?.onConnectionChange?.(true);
    // Refetch on reconnect (PRD Section 12)
    void queryClient.invalidateQueries({ queryKey: ['roadmap', userId] });
    void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
  };

  const handleOffline = () => {
    callbacks?.onConnectionChange?.(false);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  // Cleanup
  return () => {
    try {
      void supabase.removeChannel(channel);
    } catch {
      // ignore
    }
    if (syncChannel) {
      syncChannel.removeEventListener('message', handleBroadcastMessage);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  };
}

/**
 * Hook to manage realtime sync and connection state for the active user.
 */
export function useRealtimeSync(userId?: string) {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  const clearConflictNotice = useCallback(() => {
    setConflictNotice(null);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeToUserRealtime(userId, queryClient, {
      onConnectionChange: (online) => setIsOnline(online),
      onConflict: (message) => setConflictNotice(message),
    });

    return () => {
      unsubscribe();
    };
  }, [userId, queryClient]);

  return {
    isOnline,
    conflictNotice,
    setConflictNotice,
    clearConflictNotice,
  };
}

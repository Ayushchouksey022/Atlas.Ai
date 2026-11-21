import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { NewsCardItem } from '../components/NewsCard';
import type { SponsoredCardProps } from '../components/SponsoredCard';

export type FeedRowItem =
  | { type: 'news'; data: NewsCardItem }
  | { type: 'sponsored'; data: SponsoredCardProps };

const PAGE_SIZE = 10;

export function useNewsFeed() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const domainId = profile?.domain_id;

  // 1. Fetch active sponsored placements (structurally isolated query)
  const { data: sponsoredPlacements } = useQuery({
    queryKey: ['sponsored_placements', domainId],
    queryFn: async (): Promise<SponsoredCardProps[]> => {
      try {
        let query = supabase
          .from('sponsored_placements')
          .select('id, title, body, cta_url, sponsor_name, active, starts_at, ends_at')
          .eq('active', true);

        if (domainId) {
          query = query.eq('domain_id', domainId);
        }

        const now = new Date().toISOString();
        const { data, error } = await query;

        if (error) {
          console.warn('[useNewsFeed] Warning fetching sponsored placements:', error.message);
          return [];
        }

        if (!data) return [];

        return data
          .filter((p) => {
            const startsValid = !p.starts_at || p.starts_at <= now;
            const endsValid = !p.ends_at || p.ends_at >= now;
            return startsValid && endsValid;
          })
          .map((p) => ({
            id: p.id,
            title: p.title,
            body: p.body,
            cta_url: p.cta_url,
            sponsor_name: p.sponsor_name,
          }));
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fetch user verdicts for roadmap match indicator
  const { data: matchedNewsItemIds } = useQuery({
    queryKey: ['user_verdict_matches', user?.id],
    queryFn: async (): Promise<Set<string>> => {
      if (!user?.id) return new Set();
      try {
        const { data, error } = await supabase
          .from('user_verdicts')
          .select('news_item_id')
          .eq('user_id', user.id);

        if (error || !data) return new Set();
        return new Set(data.map((uv) => uv.news_item_id));
      } catch {
        return new Set();
      }
    },
    enabled: Boolean(user?.id),
    staleTime: 60 * 1000,
  });

  // 3. Infinite query for published news items
  const newsQuery = useInfiniteQuery({
    queryKey: ['news_feed', domainId],
    queryFn: async ({ pageParam = 0 }): Promise<NewsCardItem[]> => {
      let query = supabase
        .from('news_items')
        .select(`
          id,
          title,
          published_at,
          bullets,
          impact_score,
          impact_rationale,
          tags,
          url,
          source_id,
          news_sources ( name )
        `)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (domainId) {
        query = query.eq('domain_id', domainId);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(error.message);
      }

      if (!data) return [];

      return data.map((row: any) => {
        // Enforce fallback for bullets to strictly meet [string, string, string] tuple
        const bulletsRaw = Array.isArray(row.bullets) ? row.bullets : [];
        const bulletsTuple: [string, string, string] = [
          bulletsRaw[0] || 'Advancement summary point',
          bulletsRaw[1] || 'Key engineering detail',
          bulletsRaw[2] || 'Actionable takeaway',
        ];

        return {
          id: row.id,
          title: row.title,
          published_at: row.published_at,
          bullets: bulletsTuple,
          impact_score: row.impact_score || 5,
          impact_rationale: row.impact_rationale,
          tags: row.tags || [],
          url: row.url,
          source_name: row.news_sources?.name || null,
          has_roadmap_match: matchedNewsItemIds?.has(row.id) ?? false,
        };
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) {
        return undefined;
      }
      return allPages.length * PAGE_SIZE;
    },
  });

  // 4. Realtime subscription on published news_items
  useEffect(() => {
    const channel = supabase
      .channel('realtime_news_feed')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'news_items',
          filter: 'status=eq.published',
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['news_feed'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 5. Interleave one sponsored card per 10 items (fixed cadence, structural separation)
  const feedItems = useMemo<FeedRowItem[]>(() => {
    const newsPages = newsQuery.data?.pages || [];
    const allNews = newsPages.flat();
    const sponsors = sponsoredPlacements || [];

    if (allNews.length === 0) return [];

    const rows: FeedRowItem[] = [];
    let sponsorIndex = 0;

    for (let i = 0; i < allNews.length; i++) {
      rows.push({
        type: 'news',
        data: allNews[i],
      });

      // Interleave 1 sponsored placement every 10 news items (after index 9, 19, etc.)
      if ((i + 1) % 10 === 0 && sponsors.length > 0) {
        const selectedSponsor = sponsors[sponsorIndex % sponsors.length];
        rows.push({
          type: 'sponsored',
          data: selectedSponsor,
        });
        sponsorIndex++;
      }
    }

    return rows;
  }, [newsQuery.data?.pages, sponsoredPlacements]);

  return {
    ...newsQuery,
    feedItems,
    sponsoredPlacements,
  };
}

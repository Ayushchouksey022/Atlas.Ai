import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  NewsCard,
  type NewsCardItem,
  formatTimeAgo,
  getImpactColor,
} from './NewsCard';
import { ThemeProvider } from '../design-system/ThemeContext';

describe('NewsCard Component', () => {
  const mockItem: NewsCardItem = {
    id: 'test-news-1',
    title: 'Claude 3.5 Sonnet Released with Coding Enhancements',
    published_at: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
    bullets: [
      'Sets state-of-the-art benchmarks in SWE-bench agentic refactoring.',
      'Executes code iterations twice as fast as previous flagship models.',
      'Adopt in developer test environments to benchmark speedups.',
    ],
    impact_score: 8,
    impact_rationale:
      'Major new model release with significant tooling implications.',
    tags: ['ai-assistants', 'llm', 'anthropic'],
    url: 'https://example.com/claude-35',
    source_name: 'Anthropic Engineering',
    has_roadmap_match: false,
  };

  const renderCard = (props: Partial<NewsCardItem> = {}) => {
    return renderToStaticMarkup(
      <ThemeProvider>
        <NewsCard
          item={{ ...mockItem, ...props }}
          onRedButtonPress={vi.fn()}
          onOpenScaleLegend={vi.fn()}
        />
      </ThemeProvider>,
    );
  };

  it('renders title, source name, formatted time, tags, and impact score', () => {
    const html = renderCard();

    expect(html).toContain('Claude 3.5 Sonnet Released with Coding Enhancements');
    expect(html).toContain('Anthropic Engineering');
    expect(html).toContain('2h ago');
    expect(html).toContain('Impact 8/10');
    expect(html).toContain('ai-assistants');
    expect(html).toContain('Read Source ↗');
  });

  it('strictly enforces the PRD invariant: renders EXACTLY three bullet points', () => {
    const html = renderCard();

    // Verify all 3 bullets are rendered
    expect(html).toContain(mockItem.bullets[0]);
    expect(html).toContain(mockItem.bullets[1]);
    expect(html).toContain(mockItem.bullets[2]);

    // Count bullet dots • in the markup
    const bulletDots = (html.match(/•/g) || []).length;
    // 1 dot in the header "Anthropic Engineering • 2h ago" + 3 in the bullet list = 4 total dots
    expect(bulletDots).toBe(4);
    expect(mockItem.bullets).toHaveLength(3);
  });

  it('renders prominent Red Button', () => {
    const html = renderCard();
    expect(html).toContain('🔴 Red Button');
  });

  it('renders "Matches your roadmap" hint ONLY when has_roadmap_match is true', () => {
    const withoutMatch = renderCard({ has_roadmap_match: false });
    expect(withoutMatch).not.toContain('Matches your roadmap');

    const withMatch = renderCard({ has_roadmap_match: true });
    expect(withMatch).toContain('Matches your roadmap');
  });

  it('formatTimeAgo helper correctly formats time deltas', () => {
    expect(formatTimeAgo(null)).toBe('Recent');
    expect(formatTimeAgo(new Date(Date.now() - 30000).toISOString())).toBe('Just now');
    expect(formatTimeAgo(new Date(Date.now() - 60000 * 5).toISOString())).toBe('5m ago');
    expect(formatTimeAgo(new Date(Date.now() - 3600000 * 4).toISOString())).toBe('4h ago');
    expect(formatTimeAgo(new Date(Date.now() - 86400000 * 3).toISOString())).toBe('3d ago');
  });

  it('getImpactColor maps scores to appropriate visual tiers', () => {
    expect(getImpactColor(10).label).toBe('Breakthrough');
    expect(getImpactColor(9).label).toBe('Breakthrough');
    expect(getImpactColor(8).label).toBe('Major');
    expect(getImpactColor(7).label).toBe('Major');
    expect(getImpactColor(6).label).toBe('Notable');
    expect(getImpactColor(5).label).toBe('Notable');
    expect(getImpactColor(4).label).toBe('Minor');
    expect(getImpactColor(2).label).toBe('Minor');
  });
});

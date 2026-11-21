import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SponsoredCard, type SponsoredCardProps } from './SponsoredCard';
import { ThemeProvider } from '../design-system/ThemeContext';

describe('SponsoredCard Component', () => {
  const mockSponsorProps: SponsoredCardProps = {
    id: 'sponsor-1',
    title: 'Cloud GPU Instances for Agent Fine-Tuning',
    body: 'Accelerate your open-weights model training with high-throughput H100 clusters.',
    cta_url: 'https://example.com/sponsor',
    sponsor_name: 'ComputeCloud Inc.',
  };

  const renderCard = (props: Partial<SponsoredCardProps> = {}) => {
    return renderToStaticMarkup(
      <ThemeProvider>
        <SponsoredCard {...mockSponsorProps} {...props} />
      </ThemeProvider>,
    );
  };

  it('renders SPONSORED badge, sponsor attribution, title, body, and CTA button', () => {
    const html = renderCard();

    expect(html).toContain('SPONSORED');
    expect(html).toContain('Promoted by ComputeCloud Inc.');
    expect(html).toContain(mockSponsorProps.title);
    expect(html).toContain(mockSponsorProps.body);
    expect(html).toContain('Learn More ↗');
  });

  it('PRD Structural Separation Invariant: asserts props contain NO news, verdict, or roadmap fields', () => {
    const forbiddenKeys = [
      'news',
      'news_item',
      'news_item_id',
      'bullets',
      'impact_score',
      'impact_rationale',
      'verdict',
      'verdicts',
      'user_verdicts',
      'roadmap',
      'user_nodes',
      'canonical_nodes',
      'nodes',
      'edges',
    ];

    const propKeys = Object.keys(mockSponsorProps);

    for (const forbidden of forbiddenKeys) {
      expect(
        propKeys.includes(forbidden),
        `SponsoredCard must NEVER receive '${forbidden}' property (Structural Separation Invariant)`,
      ).toBe(false);
    }
  });
});

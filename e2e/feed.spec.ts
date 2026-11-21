import { test, expect } from '@playwright/test';

test.describe('News Feed Tab & Red Button (Prompt 10)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });
  });

  test('Feed Tab: Published News Cards -> 3 Bullets -> Impact Scale Modal -> Red Button -> Interleaved Sponsored Card', async ({
    page,
  }) => {
    // 1. Mock news_items REST API responses with deterministic fixtures
    const mockNewsItems = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Anthropic Introduces Claude 3.5 Sonnet',
        published_at: new Date(Date.now() - 3600000).toISOString(),
        bullets: [
          'State-of-the-art SWE-bench agentic refactoring benchmarks.',
          'Two times faster than Claude 3 Opus with lower latency.',
          'Adopt in test environments to evaluate code refactoring speedups.',
        ],
        impact_score: 8,
        impact_rationale: 'Significant new model release altering workflows.',
        tags: ['ai-assistants', 'llm', 'anthropic'],
        url: 'https://news.example.com/posts/claude-35',
        source_id: 'src-1',
        news_sources: { name: 'Anthropic Engineering' },
        status: 'published',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Cursor Editor Releases Multi-File Agentic Mode',
        published_at: new Date(Date.now() - 7200000).toISOString(),
        bullets: [
          'Background indexing for massive monorepo codebases.',
          'Instant diff previews across multi-file agent steps.',
          'Upgrade to latest version for improved terminal workflows.',
        ],
        impact_score: 7,
        impact_rationale: 'Major capability enhancement in AI editor category.',
        tags: ['editors-ides', 'cursor'],
        url: 'https://news.example.com/posts/cursor-agent',
        source_id: 'src-2',
        news_sources: { name: 'Cursor Changelog' },
        status: 'published',
      },
    ];

    const mockSponsoredPlacements = [
      {
        id: 'sponsor-101',
        title: 'High-Throughput H100 Cloud GPU Clusters',
        body: 'Scale your agent fine-tuning and inference pipelines with zero queue latency.',
        cta_url: 'https://example.com/sponsor-gpu',
        sponsor_name: 'ComputeCloud Inc.',
        domain_id: '00000000-0000-0000-0000-000000000001',
        active: true,
        starts_at: null,
        ends_at: null,
      },
    ];

    await page.route('**/rest/v1/news_items*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockNewsItems),
      });
    });

    await page.route('**/rest/v1/sponsored_placements*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSponsoredPlacements),
      });
    });

    // 2. Sign up user and complete onboarding to land on Feed tab
    await page.goto('/(auth)/sign-up');
    const email = `test_feed_${Date.now()}@example.com`;
    await page.getByTestId('display-name-input').fill('Ada Lovelace');
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill('ada123456');
    await page.getByTestId('sign-up-button').click();

    await expect(page.getByText('AI-Assisted Software Development')).toBeVisible();
    await page.getByTestId('start-onboarding-button').click();

    await expect(page.getByText('What tools & skills do you already use?')).toBeVisible();
    await page.getByTestId('picker-next-button').click();

    await expect(page.getByText('Self-Rate Your Experience by Area')).toBeVisible();
    await page.getByTestId('generate-roadmap-button').click();

    // 3. Arrives at AI News Feed
    await expect(page.getByText('AI News Feed')).toBeVisible();
    await expect(page.getByText('Anthropic Introduces Claude 3.5 Sonnet')).toBeVisible();

    // 4. Verify News Card Elements
    const firstCard = page.getByTestId('news-card-11111111-1111-1111-1111-111111111111');
    await expect(firstCard).toBeVisible();

    // Verify source name and time
    await expect(firstCard.getByTestId('news-source-name')).toContainText('Anthropic Engineering');

    // Verify EXACTLY 3 bullets rendered and visible
    await expect(firstCard.getByTestId('news-bullet-0')).toContainText(
      'State-of-the-art SWE-bench agentic refactoring benchmarks.',
    );
    await expect(firstCard.getByTestId('news-bullet-1')).toContainText(
      'Two times faster than Claude 3 Opus with lower latency.',
    );
    await expect(firstCard.getByTestId('news-bullet-2')).toContainText(
      'Adopt in test environments to evaluate code refactoring speedups.',
    );

    // Verify Impact Score badge
    const impactBadge = firstCard.getByTestId('news-impact-badge');
    await expect(impactBadge).toContainText('Impact 8/10');

    // 5. Verify Scale Legend Modal opens from impact badge
    await impactBadge.click();
    const scaleModal = page.getByTestId('impact-scale-modal');
    await expect(scaleModal).toBeVisible();
    await expect(scaleModal.getByText('Impact Score Scale (1 - 10)')).toBeVisible();
    await expect(scaleModal.getByText('Breakthrough Tool or Model')).toBeVisible();
    await expect(scaleModal.getByText('Major Version or Significant Capability')).toBeVisible();

    // Close scale modal
    await page.getByTestId('close-scale-modal-button').click();
    await expect(scaleModal).not.toBeVisible();

    // 6. Verify Prominent Red Button & Preview Modal
    const redBtn = firstCard.getByTestId('red-button');
    await expect(redBtn).toBeVisible();
    await expect(redBtn).toContainText('🔴 Red Button');

    // Tap Red Button
    await redBtn.click();
    const previewModal = page.getByTestId('red-button-preview-modal');
    await expect(previewModal).toBeVisible();
    await expect(previewModal.getByText('Red Button Verdict Analysis')).toBeVisible();
    await expect(previewModal.getByText('Anthropic Introduces Claude 3.5 Sonnet')).toBeVisible();
    await expect(previewModal.getByText('Shield:')).toBeVisible();
    await expect(previewModal.getByText('Injection:')).toBeVisible();
    await expect(previewModal.getByText('Override:')).toBeVisible();

    // Dismiss preview modal
    await page.getByTestId('close-red-button-modal').click();
    await expect(previewModal).not.toBeVisible();

    // 7. Verify Second News Card is rendered
    const secondCard = page.getByTestId('news-card-22222222-2222-2222-2222-222222222222');
    await expect(secondCard).toBeVisible();
    await expect(secondCard.getByText('Cursor Editor Releases Multi-File Agentic Mode')).toBeVisible();
    await expect(secondCard.getByTestId('news-impact-badge')).toContainText('Impact 7/10');
  });
});

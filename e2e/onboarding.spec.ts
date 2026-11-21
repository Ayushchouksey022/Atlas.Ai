import { test, expect } from '@playwright/test';

test.describe('Onboarding Flow & Baseline Roadmap Generation (Prompt 5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });
  });

  test('Full Onboarding: Goal -> Picker with Search & Multi-select -> Levels -> Generating -> App Tabs', async ({
    page,
  }) => {
    // 1. Sign up fresh user
    await page.goto('/(auth)/sign-up');
    const email = `test_onboarding_${Date.now()}@example.com`;
    await page.getByTestId('display-name-input').fill('Ada Lovelace');
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill('ada123456');
    await page.getByTestId('sign-up-button').click();

    // 2. Goal card displayed
    await expect(page).toHaveURL(/.*onboarding.*/);
    await expect(page.getByText('AI-Assisted Software Development')).toBeVisible();
    await expect(page.getByText('Domain Goal')).toBeVisible();
    await expect(page.getByText('What you\'ll get:')).toBeVisible();

    // 3. Start Onboarding
    await page.getByTestId('start-onboarding-button').click();

    // 4. Structured Picker screen
    await expect(page.getByText('What tools & skills do you already use?')).toBeVisible();
    await expect(page.getByTestId('selected-count-badge')).toBeVisible();

    // Search filter test
    const searchInput = page.getByTestId('picker-search-input');
    await searchInput.fill('Modern IDE');
    await expect(page.getByTestId('node-card-modern-ide-fundamentals')).toBeVisible();

    // Select node
    await page.getByTestId('node-card-modern-ide-fundamentals').click();
    await expect(page.getByTestId('selected-count-badge')).toContainText('1 Selected');

    // Clear search
    await searchInput.fill('');

    // Select All in Testing area
    const selectAllTesting = page.getByTestId('select-all-testing');
    if (await selectAllTesting.isVisible()) {
      await selectAllTesting.click();
    }

    // Proceed to Step 3: Skill Levels
    await page.getByTestId('picker-next-button').click();

    // 5. Rate Experience by Area screen
    await expect(page.getByText('Self-Rate Your Experience by Area')).toBeVisible();
    await expect(page.getByText('Editors & IDEs')).toBeVisible();
    await expect(page.getByText('AI Coding Assistants')).toBeVisible();

    // Change Editors level to Expert
    await page.getByTestId('level-editors-ides-expert').click();

    // 6. Generate Roadmap
    await page.getByTestId('generate-roadmap-button').click();

    // 7. Verify Generating step and successful transition to main app
    await expect(page.getByText('AI News Feed')).toBeVisible();

    // 8. Verify user_nodes rows generated
    const userNodes = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('__atlas_user_nodes__');
      return raw ? JSON.parse(raw) : [];
    });
    expect(userNodes.length).toBeGreaterThan(0);
  });

  test('Edge Case: User selects nothing (starts from scratch)', async ({ page }) => {
    await page.goto('/(auth)/sign-up');
    const email = `test_zero_${Date.now()}@example.com`;
    await page.getByTestId('display-name-input').fill('Clean Slate');
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill('secretpass');
    await page.getByTestId('sign-up-button').click();

    await expect(page).toHaveURL(/.*onboarding.*/);
    await page.getByTestId('start-onboarding-button').click();

    // In picker, select nothing, button says "Skip (Start from scratch)"
    await expect(page.getByTestId('picker-next-button')).toContainText('Skip (Start from scratch)');
    await page.getByTestId('picker-next-button').click();

    // Proceeds to levels
    await expect(page.getByText('Self-Rate Your Experience by Area')).toBeVisible();
    await page.getByTestId('generate-roadmap-button').click();

    // Successfully generates roadmap
    await expect(page.getByText('AI News Feed')).toBeVisible();
  });

  test('Edge Case: User abandons midway and returns (resumes where they left off)', async ({
    page,
  }) => {
    await page.goto('/(auth)/sign-up');
    const email = `test_abandon_${Date.now()}@example.com`;
    await page.getByTestId('display-name-input').fill('Resilient Dev');
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill('secretpass');
    await page.getByTestId('sign-up-button').click();

    // Step 1: Goal
    await page.getByTestId('start-onboarding-button').click();

    // Step 2: Picker -> select node
    await expect(page.getByText('What tools & skills do you already use?')).toBeVisible();
    await page.getByTestId('node-card-modern-ide-fundamentals').click();
    await page.getByTestId('picker-next-button').click();

    // Step 3: Now on Levels screen
    await expect(page.getByText('Self-Rate Your Experience by Area')).toBeVisible();
    await page.getByTestId('level-ai-assistants-expert').click();

    // User navigates away or refreshes page midway
    await page.reload();

    // Resumes right where they left off (Step 3: Levels screen!)
    await expect(page.getByText('Self-Rate Your Experience by Area')).toBeVisible();
    await page.getByTestId('generate-roadmap-button').click();

    await expect(page.getByText('AI News Feed')).toBeVisible();
  });
});

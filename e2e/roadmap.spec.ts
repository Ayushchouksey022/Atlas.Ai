import { test, expect } from '@playwright/test';

test.describe('Interactive Roadmap DAG View & State Mutations (Prompt 6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });
  });

  test('Roadmap View: Navigation -> Interactive DAG -> Node Detail Sheet -> Mark Complete -> Benchmark', async ({
    page,
  }) => {
    // 1. Sign up user and complete onboarding
    await page.goto('/(auth)/sign-up');
    const email = `test_roadmap_${Date.now()}@example.com`;
    await page.getByTestId('display-name-input').fill('Grace Hopper');
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill('grace123456');
    await page.getByTestId('sign-up-button').click();

    // Fast-path through onboarding to reach main app
    await expect(page.getByText('AI-Assisted Software Development')).toBeVisible();
    await page.getByTestId('start-onboarding-button').click();

    await expect(page.getByText('What tools & skills do you already use?')).toBeVisible();
    await page.getByTestId('picker-next-button').click();

    await expect(page.getByText('Self-Rate Your Experience by Area')).toBeVisible();
    await page.getByTestId('generate-roadmap-button').click();

    // Arrives at main app
    await expect(page.getByText('AI News Feed')).toBeVisible();

    // 2. Navigate to Roadmap Tab
    await page.getByText('My Roadmap').click();
    await expect(page.getByText("Grace Hopper's Roadmap")).toBeVisible();
    await expect(page.getByText('AI-Assisted Software Development')).toBeVisible();

    // Verify stats header counters
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.getByText('Available', { exact: true })).toBeVisible();
    await expect(page.getByText('Locked', { exact: true })).toBeVisible();

    // 3. Test Canvas Toolbar Controls
    const zoomInBtn = page.getByTestId('zoom-in-button');
    const zoomOutBtn = page.getByTestId('zoom-out-button');
    const fitBtn = page.getByTestId('fit-screen-button');
    const legacyBtn = page.getByTestId('legacy-toggle-button');

    await expect(zoomInBtn).toBeVisible();
    await expect(zoomOutBtn).toBeVisible();
    await expect(fitBtn).toBeVisible();
    await expect(legacyBtn).toBeVisible();

    // Click Zoom In & Fit Screen
    await zoomInBtn.click();
    await fitBtn.click();

    // Test Legacy Toggle
    await legacyBtn.click();
    await expect(legacyBtn).toContainText('Legacy: ON');
    await legacyBtn.click();
    await expect(legacyBtn).toContainText('Legacy: OFF');

    // 4. Tap a Node to open Detail Sheet
    const targetNode = page.getByTestId('roadmap-node-modern-ide-fundamentals');
    await expect(targetNode).toBeVisible();
    await targetNode.click();

    // Detail sheet opens
    await expect(page.getByTestId('node-detail-title')).toContainText('Modern IDE & Editor Fundamentals');
    await expect(page.getByText(/Prerequisites/)).toBeVisible();

    // 5. Update Status: Mark as Completed
    const markCompleteBtn = page.getByTestId('mark-completed-button');
    if (await markCompleteBtn.isVisible()) {
      await markCompleteBtn.click();
      // Verifies status badge in sheet updates to Completed
      await expect(page.getByTestId('sheet-status-badge')).toContainText('Completed');
    }

    // Close detail sheet
    await page.getByTestId('close-detail-sheet-button').click();
    await expect(page.getByTestId('node-detail-title')).not.toBeVisible();

    // 6. 200-Node Performance Benchmark
    await page.getByTestId('roadmap-benchmark-button').click();
    await expect(page.getByText('200-Node DAG Performance Benchmark')).toBeVisible();

    // Wait for benchmark animation and calculation to finish
    await expect(page.getByText(/.*Target Exceeded \(>= 30 FPS\).*/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Nodes Rendered:')).toBeVisible();
    await expect(page.getByText('200', { exact: true })).toBeVisible();

    // Close benchmark modal
    await page.getByTestId('close-benchmark-button').click();
    await expect(page.getByText('200-Node DAG Performance Benchmark')).not.toBeVisible();
  });
});

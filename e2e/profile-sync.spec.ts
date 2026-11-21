import { test, expect } from '@playwright/test';

test.describe('Prompt 7: Cross-Device Sync & Profile/Settings Screen', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });
  });

  test('Two browser sessions stay in sync in real-time (< 2s) & Editing stack preserves completed progress', async ({
    context,
    page: page1,
  }) => {
    // -------------------------------------------------------------------------
    // 1. Session 1: Sign up and complete onboarding
    // -------------------------------------------------------------------------
    await page1.goto('/(auth)/sign-up');
    const userEmail = `sync_test_${Date.now()}@example.com`;
    await page1.getByTestId('display-name-input').fill('Katherine Johnson');
    await page1.getByTestId('email-input').fill(userEmail);
    await page1.getByTestId('password-input').fill('orbital123456');
    await page1.getByTestId('sign-up-button').click();

    // Complete onboarding
    await expect(page1.getByText('AI-Assisted Software Development')).toBeVisible();
    await page1.getByTestId('start-onboarding-button').click();

    await expect(page1.getByText('What tools & skills do you already use?')).toBeVisible();
    await page1.getByTestId('picker-next-button').click();

    await expect(page1.getByText('Self-Rate Your Experience by Area')).toBeVisible();
    await page1.getByTestId('generate-roadmap-button').click();

    // Verify main app arrival
    await expect(page1.getByText('AI News Feed')).toBeVisible();
    console.log('CP1: Signed up & completed onboarding on page1');

    // Open Roadmap Tab on Session 1
    await page1.getByRole('tab', { name: /.*Roadmap/i }).click();
    await expect(page1.getByText(/Katherine Johnson's Roadmap/)).toBeVisible();
    console.log('CP2: Opened roadmap on page1');

    // -------------------------------------------------------------------------
    // 2. Session 2: Open second page in the same context (simulating second device/tab)
    // -------------------------------------------------------------------------
    const page2 = await context.newPage();

    const mockAuth = await page1.evaluate(
      () =>
        window.localStorage.getItem('__mock_auth__') ||
        window.sessionStorage.getItem('__mock_auth__'),
    );
    const userNodes = await page1.evaluate(
      () =>
        window.localStorage.getItem('__atlas_user_nodes__') ||
        window.sessionStorage.getItem('__atlas_user_nodes__'),
    );

    if (mockAuth) {
      await page2.addInitScript(
        ({ auth, nodes }) => {
          window.sessionStorage.setItem('__mock_auth__', auth);
          window.localStorage.setItem('__mock_auth__', auth);
          if (nodes) {
            window.sessionStorage.setItem('__atlas_user_nodes__', nodes);
            window.localStorage.setItem('__atlas_user_nodes__', nodes);
          }
        },
        { auth: mockAuth, nodes: userNodes },
      );
    }

    console.log('CP3: Initialized page2 script, navigating to /');
    await page2.goto('/');
    console.log('CP4: page2 reached /, waiting for Feed');
    await expect(page2.getByText('AI News Feed')).toBeVisible();
    console.log('CP5: Feed visible on page2, clicking Roadmap tab');
    await page2.getByRole('tab', { name: /.*Roadmap/i }).click();
    console.log('CP6: Clicked Roadmap tab on page2, waiting for Roadmap title');
    await expect(page2.getByText(/Katherine Johnson's Roadmap/)).toBeVisible();
    console.log('CP7: Roadmap title visible on page2');

    // -------------------------------------------------------------------------
    // 3. Mutate on Session 1 -> Assert Session 2 updates live within 2 seconds
    // -------------------------------------------------------------------------
    console.log('CP8: Starting Session 1 mutation');
    const targetNodeP1 = page1.getByTestId('roadmap-node-modern-ide-fundamentals');
    await expect(targetNodeP1).toBeVisible();
    await targetNodeP1.click();

    // Detail sheet opens on Session 1
    await expect(page1.getByTestId('node-detail-title')).toBeVisible();
    const markCompleteBtnP1 = page1.getByTestId('mark-completed-button');
    if (await markCompleteBtnP1.isVisible()) {
      await markCompleteBtnP1.click();
    }
    await expect(page1.getByTestId('sheet-status-badge')).toContainText('Completed');
    await page1.getByTestId('close-detail-sheet-button').click();
    console.log('CP9: Session 1 marked node complete');

    // On Session 2, inspect target node to verify state within 2 seconds
    const targetNodeP2 = page2.getByTestId('roadmap-node-modern-ide-fundamentals');
    await expect(targetNodeP2).toBeVisible({ timeout: 2000 });
    await targetNodeP2.click();

    // Detail sheet on Session 2 confirms node is completed
    await expect(page2.getByTestId('sheet-status-badge')).toContainText('Completed', {
      timeout: 2000,
    });
    await page2.getByTestId('close-detail-sheet-button').click();
    console.log('CP10: Session 2 confirmed live sync update');

    // -------------------------------------------------------------------------
    // 4. Profile Screen: Edit Display Name & Update Known Stack
    // -------------------------------------------------------------------------
    await page1.goto('/profile');
    await expect(page1.getByText('ACCOUNT IDENTITY')).toBeVisible();
    console.log('CP11: Reached Profile on Session 1');

    // Edit display name
    const nameInput = page1.getByTestId('profile-display-name-input');
    await nameInput.fill('Dr. Katherine Johnson');
    await page1.getByTestId('profile-save-name-button').click();
    await expect(page1.getByTestId('profile-name-saved')).toBeVisible();
    console.log('CP12: Saved new display name');

    // Open Stack & Levels Editor
    await page1.getByTestId('edit-stack-button').click();
    await expect(
      page1.getByText(/Invariant: Completed progress, in-progress items, and legacy replacements/),
    ).toBeVisible();

    // Change testing area level to expert
    const testingExpertBtn = page1.getByTestId('level-testing-expert');
    await testingExpertBtn.click();

    // Click Save & Update Roadmap
    await page1.getByTestId('save-stack-button').click();
    await expect(page1.getByTestId('stack-update-success')).toBeVisible();
    console.log('CP13: Saved stack and levels update');

    // -------------------------------------------------------------------------
    // 5. Invariant Verification: Completed Progress is NEVER Deleted or Reverted
    // -------------------------------------------------------------------------
    await page1.goto('/');
    await page1.getByRole('tab', { name: /.*Roadmap/i }).click();
    await expect(page1.getByRole('heading', { name: 'Roadmap' })).toBeVisible();

    // Re-inspect the node that was marked completed: it MUST still be completed!
    const recheckedNode = page1.getByTestId('roadmap-node-modern-ide-fundamentals');
    await expect(recheckedNode).toBeVisible();
    await recheckedNode.click();

    await expect(page1.getByTestId('sheet-status-badge')).toContainText('Completed');
    await page1.getByTestId('close-detail-sheet-button').click();
    console.log('CP14: Verified completed progress was preserved');

    // -------------------------------------------------------------------------
    // 6. Test Notification Preferences, Appearance & Clean Up
    // -------------------------------------------------------------------------
    await page1.goto('/profile');
    await expect(page1.getByText('NOTIFICATION PREFERENCES')).toBeVisible();

    // Toggle notification pills
    const toggleVerdicts = page1.getByTestId('toggle-notif-verdicts');
    await expect(toggleVerdicts).toContainText('ENABLED');
    await toggleVerdicts.click();
    await expect(toggleVerdicts).toContainText('MUTED');

    // Toggle Theme
    const themeBtn = page1.getByTestId('toggle-theme-button');
    await themeBtn.click();
    console.log('CP15: All assertions passed!');

    // Clean up second session
    await page2.close();
  });
});

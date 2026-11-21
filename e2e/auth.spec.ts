import { test, expect } from '@playwright/test';

test.describe('App Shell, Authentication & Route Guard', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session storage / local storage before each test
    await page.goto('/');
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });
  });

  test('Route Guard: unauthenticated user is redirected to /(auth)/sign-in', async ({ page }) => {
    await page.goto('/');
    // Expect URL to redirect to /sign-in
    await expect(page).toHaveURL(/.*sign-in.*/);

    // Expect brand title and sign-in form elements to be visible
    await expect(page.getByText('Atlas.AI')).toBeVisible();
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
  });

  test('Navigation: can navigate between Sign In and Sign Up screens', async ({ page }) => {
    await page.goto('/(auth)/sign-in');
    await expect(page.getByText('Welcome Back')).toBeVisible();

    // Click Sign Up link
    await page.getByTestId('go-to-signup-button').click();
    await expect(page).toHaveURL(/.*sign-up.*/);
    await expect(page.getByTestId('sign-up-button')).toBeVisible();
    await expect(page.getByTestId('display-name-input')).toBeVisible();

    // Click Sign In link to return
    await page.getByTestId('go-to-signin-button').click();
    await expect(page).toHaveURL(/.*sign-in.*/);
    await expect(page.getByTestId('sign-in-button').first()).toBeVisible();
  });

  test('Auth Flow: Sign Up -> Onboarding Redirect -> Complete -> App Tabs -> Sign Out', async ({ page }) => {
    await page.goto('/(auth)/sign-up');

    // 1. Fill Sign Up form
    const uniqueEmail = `test_dev_${Date.now()}@example.com`;
    await page.getByTestId('display-name-input').fill('Sarah Connor');
    await page.getByTestId('email-input').fill(uniqueEmail);
    await page.getByTestId('password-input').fill('supersecret123');
    await page.getByTestId('sign-up-button').click();

    // 2. Route guard: newly signed-up user without onboarding goes to /onboarding
    await expect(page).toHaveURL(/.*onboarding.*/);
    await expect(page.getByText('Welcome to Onboarding')).toBeVisible();
    await expect(page.getByText('Onboarding completed: false')).toBeVisible();

    // 3. Complete onboarding simulation
    await page.getByTestId('complete-onboarding-demo-button').click();

    // 4. User is now routed to main app tabs (Feed tab rendered)
    await expect(page.getByText('AI News Feed')).toBeVisible();
    await expect(page.getByText('Red Button Verdict System Preview')).toBeVisible();

    // 5. Verify Verdict visual language (PRD Section 11 & 14 invariant: icon + label)
    await expect(page.getByText('Shield')).toBeVisible();
    await expect(page.getByText('Injection')).toBeVisible();
    await expect(page.getByText('Override')).toBeVisible();

    // 6. Navigate to Profile via header button
    await page.getByTestId('header-profile-button').click();
    await expect(page).toHaveURL(/.*profile.*/);
    await expect(page.getByText('LEARNING PROFILE')).toBeVisible();
    await expect(page.getByText('Sarah Connor', { exact: true })).toBeVisible();

    // 7. Test Theme toggle
    const themeBtn = page.getByTestId('toggle-theme-button');
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();

    // 8. Sign Out
    await page.getByTestId('profile-signout-button').click();

    // 9. Verify redirected back to Sign In
    await expect(page).toHaveURL(/.*sign-in.*/);
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
  });

  test('Auth Flow: Sign In with existing account directly reaches app or onboarding', async ({ page }) => {
    await page.goto('/(auth)/sign-in');

    const email = `test_returning_${Date.now()}@example.com`;
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill('secretpass123');
    await page.getByTestId('sign-in-button').click();

    // Route guard routes to onboarding if pending
    await expect(page).toHaveURL(/.*onboarding.*/);
    await expect(page.getByText('Welcome to Onboarding')).toBeVisible();
  });
});

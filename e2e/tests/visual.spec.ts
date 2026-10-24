import { expect, test } from './fixtures';

// Baselines live in tests/__screenshots__ (Chromium on Linux). Regenerate with `pnpm e2e:update` after an intended UI change.

test('learnings page: empty and filled', async ({ app, page }) => {
  await page.goto('/');
  await expect(page.getByText('No learnings yet.')).toBeVisible();
  await expect(page).toHaveScreenshot('learnings-empty.png', { fullPage: true });

  await app.createLearning('Biology basics', 'Ask about the cells shown in the pictures.');
  await page.getByRole('link', { name: 'Learning App' }).click();
  await expect(page.getByRole('link', { name: /Biology basics/ })).toBeVisible();
  await expect(page).toHaveScreenshot('learnings-filled.png', { fullPage: true });
});

test('learning detail with an image and a questionnaire', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await expect(page.getByRole('button', { name: 'Generate questionnaire' })).toBeEnabled();
  await page.getByRole('button', { name: 'Generate questionnaire' }).click();
  await expect(page.getByRole('link', { name: 'Open' })).toBeVisible();
  await expect(page).toHaveScreenshot('learning-detail.png', { fullPage: true, mask: [app.dates] });
});

test('answer form shows tasks with lettered subquestions', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();
  await expect(page).toHaveScreenshot('answer-form-empty.png', { fullPage: true });

  await app.fillAnswers({ first: 'A cat', sky: 'Blue', a: 'Alpha', b: 'Gamma' });
  await page.getByLabel('Answer 3a').blur();
  await expect(page).toHaveScreenshot('answer-form-filled.png', { fullPage: true });
});

test('review result with the hierarchy', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();
  await app.fillAnswers({ first: 'A cat', sky: 'Blue', a: 'Alpha', b: 'Gamma' });
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByText('Success rate')).toBeVisible();
  await expect(page).toHaveScreenshot('review-result.png', { fullPage: true });
});

test('failed review offers a retry', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();
  await app.fillAnswers({ first: 'boom', sky: 'Blue', a: 'Alpha', b: 'Beta' });
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByRole('button', { name: 'Retry review' })).toBeVisible();
  await expect(page).toHaveScreenshot('review-failed.png', { fullPage: true });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('answer form fits a phone', async ({ app, page }) => {
    await app.createLearning();
    await app.uploadImage();
    await app.generateQuestionnaire();
    await expect(page).toHaveScreenshot('answer-form-mobile.png', { fullPage: true });
  });
});

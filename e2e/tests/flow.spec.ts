import { expect, test } from './fixtures';

test('empty app shows the create form and no learnings', async ({ app, page }) => {
  await page.goto('/');
  await expect(page.getByText('No learnings yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Create learning' }).click();
  await expect(page.getByText('Title is required')).toBeVisible();
  void app;
});

test('full flow: learning, image, questionnaire with subquestions, review', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();

  // Hierarchy: numbered tasks, lettered subquestions, a separate input for each subquestion.
  await expect(page.getByText('2. Which colour is the sky?')).toBeVisible();
  await expect(page.getByText('3. Study the diagram and answer the questions below.')).toBeVisible();
  await expect(page.getByText('a) Name the first element.')).toBeVisible();
  await expect(page.getByText('b) Name the second element.')).toBeVisible();
  await expect(page.getByLabel('Answer 3a')).toBeVisible();
  await expect(page.getByLabel('Answer 3b')).toBeVisible();

  await app.fillAnswers({ first: 'A cat', sky: 'Blue', a: 'Alpha', b: 'Gamma' });
  await page.getByRole('button', { name: 'Submit answers' }).click();

  // Four answerable questions; the fake review passes only the first one.
  await expect(page.getByText('25%')).toBeVisible();
  await expect(page.getByText('1 of 4 answers passed')).toBeVisible();
  await expect(page.getByText('3. Study the diagram and answer the questions below.')).toBeVisible();
  await expect(page.getByText('a) Name the first element.')).toBeVisible();
  await expect(page.getByText('Passed', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Failed', { exact: true })).toHaveCount(3);
  await expect(page.getByText('Your answer: Gamma')).toBeVisible();

  // Expected answers never reach the browser.
  await expect(page.getByText('Beta', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Learning App' }).click();
  await page.getByRole('link', { name: /Biology basics/ }).click();
  await expect(page.getByText('25% passed')).toBeVisible();
});

test('interim answers survive a reload and are cleared after submit', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();

  await page.getByLabel('Answer 1', { exact: true }).fill('draft text');
  await page.getByLabel('Blue', { exact: true }).check();
  await page.getByLabel('Answer 3b').fill('second draft'); // focus leaves the first two inputs
  await page.getByLabel('Answer 3a').click(); // and finally leaves 3b

  await page.reload();
  await expect(page.getByLabel('Answer 1', { exact: true })).toHaveValue('draft text');
  await expect(page.getByLabel('Blue', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Answer 3b')).toHaveValue('second draft');

  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByText('Success rate')).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Answer 1', { exact: true })).toHaveValue('');
});

test('a failed review can be retried', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();
  await app.fillAnswers({ first: 'boom', sky: 'Blue', a: 'Alpha', b: 'Beta' });
  await page.getByRole('button', { name: 'Submit answers' }).click();

  await expect(page.getByRole('alert')).toContainText('Simulated review failure');
  await page.getByRole('button', { name: 'Retry review' }).click();
  await expect(page.getByText('Success rate')).toBeVisible();
});

test('rejects unsupported uploads in the browser', async ({ app, page }) => {
  await app.createLearning();
  await page.getByLabel('Upload images').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(page.getByRole('alert')).toContainText('notes.txt: unsupported type');
});

test('deleting a learning returns to the list', async ({ app, page }) => {
  await app.createLearning('To delete');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('No learnings yet.')).toBeVisible();
});

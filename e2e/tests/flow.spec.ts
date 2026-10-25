import { expect, test } from './fixtures';

test('empty app shows the create form and no learnings', async ({ app, page }) => {
  await page.goto('/');
  await expect(page.getByText('Brak tematów.')).toBeVisible();
  await page.getByRole('button', { name: 'Utwórz temat' }).click();
  await expect(page.getByText('Tytuł jest wymagany')).toBeVisible();
  void app;
});

test('full flow: learning, image, questionnaire with subquestions, review', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();

  // Hierarchy: numbered questions, lettered subquestions, a separate input for each subquestion.
  await expect(page.getByText('2. Which colour is the sky?')).toBeVisible();
  await expect(page.getByText('3. Study the diagram and answer the questions below.')).toBeVisible();
  await expect(page.getByText('a) Name the first element.')).toBeVisible();
  await expect(page.getByText('b) Name the second element.')).toBeVisible();
  await expect(page.getByLabel('Odpowiedź 3a')).toBeVisible();
  await expect(page.getByLabel('Odpowiedź 3b')).toBeVisible();

  await app.fillAnswers({ first: 'A cat', sky: 'Blue', a: 'Alpha', b: 'Gamma' });
  await page.getByRole('button', { name: 'Wyślij odpowiedzi' }).click();

  // Four answerable questions; the fake review passes only the first one.
  await expect(page.getByText('25%')).toBeVisible();
  await expect(page.getByText('1 z 4 odpowiedzi poprawnych')).toBeVisible();
  await expect(page.getByText('3. Study the diagram and answer the questions below.')).toBeVisible();
  await expect(page.getByText('a) Name the first element.')).toBeVisible();
  await expect(page.getByText('Poprawna', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Błędna', { exact: true })).toHaveCount(3);
  await expect(page.getByText('Twoja odpowiedź: Gamma')).toBeVisible();

  // Expected answers never reach the browser.
  await expect(page.getByText('Beta', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Aplikacja do nauki' }).click();
  await page.getByRole('link', { name: /Biology basics/ }).click();
  await expect(page.getByText('25% poprawnych')).toBeVisible();
});

test('interim answers survive a reload and are cleared after submit', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();

  await page.getByLabel('Odpowiedź 1', { exact: true }).fill('draft text');
  await page.getByLabel('Blue', { exact: true }).check();
  await page.getByLabel('Odpowiedź 3b').fill('second draft'); // focus leaves the first two inputs
  await page.getByLabel('Odpowiedź 3a').click(); // and finally leaves 3b

  await page.reload();
  await expect(page.getByLabel('Odpowiedź 1', { exact: true })).toHaveValue('draft text');
  await expect(page.getByLabel('Blue', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Odpowiedź 3b')).toHaveValue('second draft');

  await page.getByRole('button', { name: 'Wyślij odpowiedzi' }).click();
  await expect(page.getByText('Wynik')).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Odpowiedź 1', { exact: true })).toHaveValue('');
});

test('a failed review can be retried', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();
  await app.fillAnswers({ first: 'boom', sky: 'Blue', a: 'Alpha', b: 'Beta' });
  await page.getByRole('button', { name: 'Wyślij odpowiedzi' }).click();

  await expect(page.getByRole('alert')).toContainText('Simulated review failure');
  await page.getByRole('button', { name: 'Ponów ocenę' }).click();
  await expect(page.getByText('Wynik')).toBeVisible();
});

test('rejects unsupported uploads in the browser', async ({ app, page }) => {
  await app.createLearning();
  await page.getByLabel('Prześlij obrazy').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(page.getByRole('alert')).toContainText('notes.txt: nieobsługiwany typ pliku');
});

test('deleting a learning returns to the list', async ({ app, page }) => {
  await app.createLearning('To delete');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Usuń' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Brak tematów.')).toBeVisible();
});

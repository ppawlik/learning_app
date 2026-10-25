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

  // Every card carries its full label, and only failed answers reveal the correct answer (ADR 0012).
  await expect(page.getByText('3b) Name the second element.')).toBeVisible();
  await expect(page.getByText('Poprawna odpowiedź:')).toHaveCount(3);
  await expect(page.getByText('Poprawna odpowiedź: Beta')).toBeVisible();
  await expect(page.getByText('Poprawna odpowiedź: A cat')).toHaveCount(0);

  // Breadcrumbs name the topic, the set and the attempt (per-topic numbers, no database ids).
  const trail = page.getByRole('navigation', { name: 'Okruszki' });
  await expect(trail).toContainText('Tematy › Biology basics › Zestaw 1 › Podejście 1');

  await page.getByRole('link', { name: 'Aplikacja do nauki' }).click();
  await expect(page.getByText('1 zestaw · ostatni wynik 25%')).toBeVisible();
  await page.getByRole('link', { name: /Biology basics/ }).click();
  await expect(page.getByText('Podejście 1')).toBeVisible();
  await expect(page.getByText('25% poprawnych')).toBeVisible();
});

test('the review can be filtered to failed answers and the set solved again', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();
  await app.fillAnswers({ first: 'A cat', sky: 'Blue', a: 'Alpha', b: 'Gamma' });
  await page.getByRole('button', { name: 'Wyślij odpowiedzi' }).click();
  await expect(page.getByText('25%')).toBeVisible();

  await expect(page.getByRole('link', { name: '2', exact: true })).toHaveAttribute('href', '#odp-2');
  await page.getByLabel('Tylko błędne (3)').check();
  await expect(page.getByText('1. What object is shown in the picture?')).toHaveCount(0);
  await expect(page.getByText('2. Which colour is the sky?')).toBeVisible();

  await page.getByRole('link', { name: 'Rozwiąż ponownie' }).click();
  await expect(page.getByLabel('Odpowiedź 1', { exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'Wróć do tematu' }).click();
  await expect(page.getByRole('heading', { name: 'Biology basics' })).toBeVisible();
});

test('empty answers need a confirmation before the form is sent', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await app.generateQuestionnaire();
  await expect(page.getByText('0 z 4 odpowiedzi')).toBeVisible();
  await page.getByLabel('Odpowiedź 1', { exact: true }).fill('A cat');
  await expect(page.getByText('1 z 4 odpowiedzi')).toBeVisible();
  await page.getByRole('button', { name: 'Wyślij odpowiedzi' }).click();
  await expect(page.getByRole('alert')).toContainText('Masz 3 puste odpowiedzi. Wysłać mimo to?');
  await page.getByRole('button', { name: 'Wróć do formularza' }).click();
  await page.getByRole('button', { name: 'Wyślij odpowiedzi' }).click();
  await page.getByRole('button', { name: 'Wyślij mimo to' }).click();
  await expect(page.getByText('Wynik')).toBeVisible();
});

test('a failed generation can be retried from the topic page and the questionnaire page', async ({ app, page }) => {
  await app.createLearning('Retry me', 'boom: fail the first generation');
  await app.uploadImage();
  await page.getByRole('button', { name: 'Wygeneruj zestaw pytań' }).click();
  await expect(page.getByText('Niepowodzenie')).toBeVisible();
  await expect(page.getByText('Simulated generation failure')).toBeVisible();
  await page.getByRole('button', { name: 'Wygeneruj ponownie' }).click();
  await expect(page.getByRole('link', { name: 'Otwórz' })).toBeVisible();
  await expect(page.getByText('Niepowodzenie')).toHaveCount(0);
});

test('topic and set management: edit, delete a set, delete the topic', async ({ app, page }) => {
  await app.createLearning();
  await app.uploadImage();
  await page.getByRole('button', { name: 'Wygeneruj zestaw pytań' }).click();
  await expect(page.getByRole('link', { name: 'Otwórz' })).toBeVisible();

  await page.getByRole('button', { name: 'Edytuj' }).click();
  await page.getByLabel('Tytuł').fill('Renamed topic');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed topic' })).toBeVisible();

  await page.getByRole('button', { name: 'Usuń zestaw 1' }).click();
  await page.getByRole('button', { name: 'Nie' }).click();
  await expect(page.getByText('Zestaw 1')).toBeVisible();
  await page.getByRole('button', { name: 'Usuń zestaw 1' }).click();
  await page.getByRole('button', { name: 'Tak' }).click();
  await expect(page.getByText('Zestaw 1')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Wyślij mimo to' }).click(); // the first answer in 3a is still empty
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
  await page.getByRole('button', { name: 'Usuń', exact: true }).click();
  await page.getByRole('button', { name: 'Tak' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Brak tematów.')).toBeVisible();
});

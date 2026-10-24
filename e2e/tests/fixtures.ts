import { expect, test as base, type Locator, type Page } from '@playwright/test';

// 1x1 PNG, enough for the upload flow.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export const test = base.extend<{ app: AppPage }>({
  app: async ({ page, request }, use) => {
    const res = await request.post('http://127.0.0.1:3101/api/__e2e/reset');
    expect(res.status()).toBe(204);
    await use(new AppPage(page));
  },
});
export { expect };

export class AppPage {
  constructor(readonly page: Page) {}

  /** Timestamps change on every run, so visual tests mask them. */
  get dates(): Locator {
    return this.page.getByText(/·\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}/);
  }

  async createLearning(title = 'Biology basics', prompt = 'Ask about the cells shown in the pictures.') {
    await this.page.goto('/');
    await this.page.getByLabel('Title').fill(title);
    await this.page.getByLabel(/Prompt/).fill(prompt);
    await this.page.getByRole('button', { name: 'Create learning' }).click();
    await expect(this.page.getByRole('heading', { name: title })).toBeVisible();
  }

  async uploadImage(name = 'cell.png') {
    await this.page.getByLabel('Upload images').setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
    await expect(this.page.getByRole('img', { name })).toBeVisible();
  }

  async generateQuestionnaire() {
    await this.page.getByRole('button', { name: 'Generate questionnaire' }).click();
    await this.page.getByRole('link', { name: 'Open' }).click();
    await expect(this.page.getByText('1. What object is shown in the picture?')).toBeVisible();
  }

  async fillAnswers(answers: { first: string; sky: string; a: string; b: string }) {
    await this.page.getByLabel('Answer 1', { exact: true }).fill(answers.first);
    await this.page.getByLabel(answers.sky, { exact: true }).check();
    await this.page.getByLabel('Answer 3a').fill(answers.a);
    await this.page.getByLabel('Answer 3b').fill(answers.b);
  }
}

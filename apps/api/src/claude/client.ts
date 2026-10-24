import type { FastifyBaseLogger } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import {
  generatedQuestionnaireSchema,
  reviewResultSchema,
  type GeneratedQuestionnaire,
  type ReviewResult,
} from '@learning/shared';
import { config } from '../config.js';

export interface ImageInput {
  path: string;
  mimeType: string;
}

export interface ReviewInput {
  learningPrompt: string;
  images: ImageInput[];
  items: { questionId: number; text: string; options: string[] | null; expectedAnswer: string; answer: string }[];
}

/** Abstraction over Claude so routes can be tested without network calls. */
export interface ClaudeService {
  generateQuestionnaire(prompt: string, images: ImageInput[]): Promise<GeneratedQuestionnaire>;
  reviewAnswers(input: ReviewInput): Promise<ReviewResult>;
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

async function imageBlocks(images: ImageInput[]): Promise<Anthropic.ImageBlockParam[]> {
  return Promise.all(
    images.map(async (img) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img.mimeType as ImageMediaType,
        data: (await fs.readFile(img.path)).toString('base64'),
      },
    })),
  );
}

const questionnaireTool: Anthropic.Tool = {
  name: 'submit_questionnaire',
  description: 'Submit the generated questionnaire.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            type: { type: 'string', enum: ['open', 'multiple_choice'] },
            options: { type: 'array', items: { type: 'string' }, description: 'Required for multiple_choice' },
            expectedAnswer: { type: 'string', description: 'The correct answer (for multiple_choice, the exact correct option text)' },
          },
          required: ['text', 'type', 'expectedAnswer'],
        },
      },
    },
    required: ['questions'],
  },
};

const reviewTool: Anthropic.Tool = {
  name: 'submit_review',
  description: 'Submit the review of every answer.',
  input_schema: {
    type: 'object',
    properties: {
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            questionId: { type: 'integer' },
            verdict: { type: 'string', enum: ['passed', 'failed'] },
            feedback: { type: 'string', description: 'Why the answer passed or failed, and how to improve it' },
          },
          required: ['questionId', 'verdict', 'feedback'],
        },
      },
      summary: { type: 'string', description: 'Descriptive overall assessment of how good the answers were' },
    },
    required: ['answers', 'summary'],
  },
};

// Large inputs (e.g. many textbook pages) can need long outputs; a too-small limit truncates the tool call.
const MAX_OUTPUT_TOKENS = 16_000;

export function createClaudeService(log: FastifyBaseLogger, apiKey = config.anthropicApiKey): ClaudeService {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 120_000 });

  async function callTool(tool: Anthropic.Tool, content: Anthropic.ContentBlockParam[]): Promise<unknown> {
    const imageCount = content.filter((c) => c.type === 'image').length;
    const started = Date.now();
    log.info({ tool: tool.name, model: config.model, imageCount }, 'claude request');
    const res = await client.messages.create({
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      tools: [tool],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [...content, { type: 'text', text: `Respond only by calling the ${tool.name} tool.` }] }],
    });
    log.info(
      {
        tool: tool.name,
        durationMs: Date.now() - started,
        stopReason: res.stop_reason,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
      'claude response',
    );
    if (res.stop_reason === 'max_tokens') {
      throw new Error('Claude ran out of output tokens before finishing; ask for fewer questions or use fewer images');
    }
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!block) throw new Error('Claude did not return structured output');
    return block.input;
  }

  return {
    async generateQuestionnaire(prompt, images) {
      const content: Anthropic.ContentBlockParam[] = [
        ...(await imageBlocks(images)),
        {
          type: 'text',
          text:
            `You are creating a study questionnaire based on the attached images.\n` +
            `Instructions from the learner:\n"""\n${prompt}\n"""\n` +
            `Follow the instructions above (including how many questions to create, if stated; otherwise create 5-10). ` +
            `Base every question on the image content. Provide the expected answer for each question. ` +
            `Do not prefix question text with numbering or labels such as "Zadanie 1", "Task 1" or "1."; the app numbers questions itself.`,
        },
      ];
      return generatedQuestionnaireSchema.parse(await callTool(questionnaireTool, content));
    },

    async reviewAnswers({ learningPrompt, images, items }) {
      const payload = items.map((i) => ({
        questionId: i.questionId,
        question: i.text,
        options: i.options,
        expectedAnswer: i.expectedAnswer,
        learnerAnswer: i.answer,
      }));
      const content: Anthropic.ContentBlockParam[] = [
        ...(await imageBlocks(images)),
        {
          type: 'text',
          text:
            `You are reviewing a learner's answers to a questionnaire built from the attached images.\n` +
            `Original learning instructions:\n"""\n${learningPrompt}\n"""\n` +
            `Questions, expected answers and learner answers (JSON):\n${JSON.stringify(payload, null, 2)}\n\n` +
            `Mark each answer "passed" if it is correct or substantially equivalent to the expected answer, otherwise "failed". ` +
            `Give specific feedback per answer, plus a descriptive overall summary. Review every questionId exactly once.`,
        },
      ];
      return reviewResultSchema.parse(await callTool(reviewTool, content));
    },
  };
}

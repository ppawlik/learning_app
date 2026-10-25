import { beforeEach, describe, expect, it, vi } from 'vitest';
import pino from 'pino';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

const { createClaudeService } = await import('../src/claude/client.js');

const log = pino({ level: 'silent' });
const toolUse = (input: unknown, stop_reason = 'tool_use') => ({
  stop_reason,
  usage: { input_tokens: 1, output_tokens: 1 },
  content: [{ type: 'tool_use', id: 't', name: 'x', input }],
});

beforeEach(() => create.mockReset());

describe('createClaudeService', () => {
  it('refuses to start without an API key', () => {
    expect(() => createClaudeService(log, '')).toThrow('ANTHROPIC_API_KEY');
  });

  it('generates a hierarchical questionnaire through the tool, with tool_choice auto', async () => {
    create.mockResolvedValue(
      toolUse({
        questions: [{ text: 'Statement', subquestions: [{ text: 'a?', type: 'open', expectedAnswer: 'A' }] }],
      }),
    );
    const result = await createClaudeService(log, 'key').generateQuestionnaire('Ask about cells', []);

    expect(result.questions[0]?.subquestions).toHaveLength(1);
    const req = create.mock.calls[0]![0];
    expect(req.tool_choice).toEqual({ type: 'auto' });
    expect(req.tools[0].name).toBe('submit_questionnaire');
    const prompt = JSON.stringify(req.messages);
    expect(prompt).toContain('Ask about cells');
    expect(prompt).toContain('subquestions');
    expect(prompt).toContain('Respond only by calling the submit_questionnaire tool');
  });

  it('fails clearly when the output is truncated', async () => {
    create.mockResolvedValue({ ...toolUse({ questions: [] }), stop_reason: 'max_tokens' });
    await expect(createClaudeService(log, 'key').generateQuestionnaire('p', [])).rejects.toThrow('ran out of output tokens');
  });

  it('fails when Claude does not call the tool', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'hi' }] });
    await expect(createClaudeService(log, 'key').generateQuestionnaire('p', [])).rejects.toThrow('structured output');
  });

  it('rejects tool input that does not match the shared schema', async () => {
    create.mockResolvedValue(toolUse({ questions: [{ text: 'no type or answer' }] }));
    await expect(createClaudeService(log, 'key').generateQuestionnaire('p', [])).rejects.toThrow();
  });

  it('sends the question statement as context when reviewing a subquestion', async () => {
    create.mockResolvedValue(toolUse({ answers: [{ questionId: 2, verdict: 'passed', feedback: 'ok' }], summary: 's' }));
    const result = await createClaudeService(log, 'key').reviewAnswers({
      learningPrompt: 'p',
      images: [],
      items: [
        { questionId: 1, context: null, text: 'Plain', options: null, expectedAnswer: 'x', answer: 'y' },
        { questionId: 2, context: 'Shared statement', text: 'Part', options: null, expectedAnswer: 'x', answer: 'y' },
      ],
    });

    expect(result.summary).toBe('s');
    const sent = JSON.stringify(create.mock.calls[0]![0].messages);
    expect(sent).toContain('questionStatement');
    expect(sent).toContain('Shared statement');
    expect(sent.match(/questionStatement/g)).toHaveLength(1); // plain questions carry no context
  });
});

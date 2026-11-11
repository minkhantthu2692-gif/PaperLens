import type { AiTaskId } from './types';

export const AI_PROMPT_VERSION = 2;

export interface AiPrompt {
  system: string;
  user: string;
}

const BASE_SYSTEM_PROMPT = [
  'You are a careful document editing assistant.',
  'Preserve every fact, name, number, date, and unit exactly.',
  'Never invent missing content. Never add commentary, headings, or explanations that are not in the source.',
  'Use plain paragraphs; do not use Markdown code fences.',
].join(' ');

const TASK_INSTRUCTIONS: Record<Exclude<AiTaskId, 'translate'>, string> = {
  cleanup:
    'Clean up OCR text. Tidy spacing, join line breaks inside paragraphs, repair conservative line-end hyphenation, and keep paragraph boundaries. Do not rewrite the wording.',
  proofread:
    'Proofread the text. Correct spelling, grammar, and punctuation while keeping the original wording and structure as close as possible.',
  rewrite:
    'Rewrite the text for clarity and readability while preserving all meaning, facts, and structure. Keep the result concise.',
  summarize:
    'Summarize the key points of the text clearly and concisely. Do not add facts that are not present in the source.',
};

export function buildAiPrompt(
  task: AiTaskId,
  text: string,
  targetLanguage?: string,
  options: { sourceLanguage?: string; detectSourceLanguage?: boolean } = {},
): AiPrompt {
  let instruction: string;
  if (task === 'translate') {
    const target = targetLanguage?.trim() || 'English';
    const source = options.sourceLanguage?.trim();
    const sourceInstruction = source ? ` The source language is ${source}.` : '';
    const translationInstruction = `Translate the text into ${target}.${sourceInstruction} Preserve names, numbers, and paragraph structure.`;
    instruction = options.detectSourceLanguage
      ? `${translationInstruction} Detect the source language and return only a valid JSON object with exactly two string properties: "detectedSourceLanguage" (an ISO 639-1 language code, or "und" if unknown) and "translation" (the complete translation). Do not use Markdown fences.`
      : `${translationInstruction} Return only the translation.`;
  } else {
    instruction = `${TASK_INSTRUCTIONS[task]} Return only the resulting text.`;
  }

  return {
    system: `${BASE_SYSTEM_PROMPT} ${instruction}`,
    user: text,
  };
}

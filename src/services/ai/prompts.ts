import type {
  AiImageTaskId,
  AiOutputLength,
  AiTaskId,
  AiTaskOptions,
  AiTone,
  AiTranslationStyle,
} from './types';

export const AI_PROMPT_VERSION = 4;

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

const TASK_INSTRUCTIONS: Record<Exclude<AiTaskId, 'translate' | 'custom'>, string> = {
  cleanup:
    'Clean up OCR text. Tidy spacing, join line breaks inside paragraphs, repair conservative line-end hyphenation, and keep paragraph boundaries. Do not rewrite the wording.',
  proofread:
    'Proofread the text. Correct spelling, grammar, and punctuation while keeping the original wording and structure as close as possible.',
  rewrite:
    'Rewrite the text for clarity and readability while preserving all meaning, facts, and structure. Keep the result concise.',
  summarize:
    'Summarize the key points of the text clearly and concisely. Do not add facts that are not present in the source.',
  simplify:
    'Simplify the wording so a general reader can understand it. Keep every fact, name, and number, and stay in the original language.',
  academic:
    'Rewrite the text in a precise academic register for a scholarly paper. Keep every fact, citation marker, name, and number, and preserve the paragraph and list structure.',
  'academic-tone':
    'Rewrite the text in a consistent formal academic tone. Do not change the meaning, facts, citation markers, names, or numbers, and preserve the paragraph structure.',
  keypoints:
    'List the key points as short standalone lines starting with "- ". Do not add facts that are not present in the source and do not add a title.',
  bullets:
    'Convert the text into a concise bulleted list. Start every line with "- " and keep the original facts and their order. Do not add items that are not in the source.',
  explain:
    'Explain the text clearly for a reader who is unfamiliar with the subject. Use plain language, keep the original language, and do not add facts that are not in the source.',
};

const TONE_INSTRUCTIONS: Record<AiTone, string> = {
  academic: 'Use a precise academic tone.',
  professional: 'Use a clear professional tone.',
  casual: 'Use a friendly, conversational tone without losing accuracy.',
};

const LENGTH_INSTRUCTIONS: Record<AiOutputLength, string> = {
  short: 'Keep the result as short as possible, at most one short paragraph.',
  balanced: 'Keep the result about as long as the source.',
  detailed: 'Be thorough and keep all relevant detail from the source.',
};

const STYLE_INSTRUCTIONS: Record<AiTranslationStyle, string> = {
  natural: 'Translate naturally, as a fluent native speaker would write it.',
  formal:
    'Use a formal register suitable for official or academic documents, while staying accurate.',
  literal:
    'Translate as literally as possible while remaining grammatical; keep the original sentence order where it does not distort the meaning.',
};

const IMAGE_BASE_SYSTEM_PROMPT = [
  'You are a document imaging assistant that evaluates scan quality.',
  'You only describe image quality and locally applied image-processing settings.',
  'Never transcribe, translate, or reproduce the document text.',
  'Never invent content. Reply with JSON only; do not use Markdown code fences.',
].join(' ');

const IMAGE_ISSUE_SCHEMA =
  'Return a JSON object with exactly these properties: "summary" (one or two short sentences), "issues" (array of at most 6 objects with "code" from [low-light, over-exposed, low-contrast, blur, noise, skew, uneven-lighting, faint-text, curvature, perspective, handwriting, difficult-regions], "severity" from [low, medium, high] and an optional "detail" of at most 120 characters), "recommendedPreset" (one of [document, handwriting, old-scan, camera, low-contrast] or null) and "recommendations" (object containing any of: autoEnhance boolean, rotation degrees between -180 and 180, deskew boolean, denoise 0-100, brightness -100-100, contrast -100-100, grayscale boolean, binarize "none" or "adaptive", threshold 0-100, sharpen 0-100, shadowRemoval boolean, dewarp boolean).';

/** Prompt for the image analysis and image enhancement tasks. */
export function buildImageAiPrompt(task: AiImageTaskId): AiPrompt {
  const instruction =
    task === 'image-analysis'
      ? 'Analyze the attached document image and identify quality problems: blur, poor lighting (too dark or over-exposed), low contrast, uneven lighting or shadows, noise, skew or rotation, page curvature, perspective distortion, handwriting, and regions that look difficult to read. Also recommend locally applied refinement settings that would help.'
      : 'Suggest the strongest locally applied refinement settings that would improve the legibility of the attached document image, while avoiding aggressive processing that would destroy handwriting or faint characters. Describe the remaining problems that cannot be fixed on-device.';
  return {
    system: `${IMAGE_BASE_SYSTEM_PROMPT} ${instruction}`,
    user: `${IMAGE_ISSUE_SCHEMA} The document image is attached.`,
  };
}

function buildModifierInstructions(options: AiTaskOptions): string[] {
  const parts: string[] = [];
  if (options.tone) {
    parts.push(TONE_INSTRUCTIONS[options.tone]);
  }
  if (options.outputLength) {
    parts.push(LENGTH_INSTRUCTIONS[options.outputLength]);
  }
  if (options.preserveFormatting) {
    parts.push(
      'Preserve the original paragraph breaks, list structure, and line breaks that carry meaning.',
    );
  }
  if (options.contextAwareness) {
    parts.push(
      'Use the surrounding sentences in the provided text to resolve ambiguous references. Do not assume content that is not in the text.',
    );
  }
  return parts;
}

export function buildAiPrompt(
  task: AiTaskId,
  text: string,
  targetLanguage?: string,
  options: AiTaskOptions & { sourceLanguage?: string; detectSourceLanguage?: boolean } = {},
): AiPrompt {
  let instruction: string;
  if (task === 'translate') {
    const target = targetLanguage?.trim() || 'English';
    const source = options.sourceLanguage?.trim();
    const sourceInstruction = source ? ` The source language is ${source}.` : '';
    const style = options.translationStyle ? STYLE_INSTRUCTIONS[options.translationStyle] : '';
    const translationInstruction =
      `Translate the text into ${target}.${sourceInstruction} ${style} Preserve names, numbers, and paragraph structure.`.trim();
    instruction = options.detectSourceLanguage
      ? `${translationInstruction} Detect the source language and return only a valid JSON object with exactly two string properties: "detectedSourceLanguage" (an ISO 639-1 language code, or "und" if unknown) and "translation" (the complete translation). Do not use Markdown fences.`
      : `${translationInstruction} Return only the translation.`;
  } else if (task === 'custom') {
    const custom = options.customInstruction?.trim();
    if (!custom) {
      throw new Error('custom-instruction-required');
    }
    instruction = `${custom} Return only the resulting text unless the instruction asks for a specific format.`;
  } else {
    instruction = `${TASK_INSTRUCTIONS[task]} Return only the resulting text.`;
  }

  const modifiers = buildModifierInstructions(options);
  const allInstructions =
    modifiers.length > 0 ? `${instruction} ${modifiers.join(' ')}` : instruction;

  return {
    system: `${BASE_SYSTEM_PROMPT} ${allInstructions}`,
    user: text,
  };
}

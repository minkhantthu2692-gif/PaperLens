import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Eraser,
  GraduationCap,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  PenLine,
  SpellCheck,
} from 'lucide-react';
import type { AiTaskId } from '@/services/ai/types';
import { DEFAULT_AI_FAVORITE_ACTIONS } from '@/services/ai/types';

export const AI_ACTION_CATEGORIES = ['improve', 'process', 'academic', 'custom'] as const;

export type AiActionCategory = (typeof AI_ACTION_CATEGORIES)[number];

type AiActionLabelKey =
  | 'assistant.actionProofread'
  | 'assistant.actionRewrite'
  | 'assistant.actionCleanup'
  | 'assistant.actionSimplify'
  | 'assistant.actionSummarize'
  | 'assistant.actionKeypoints'
  | 'assistant.actionBullets'
  | 'assistant.actionAcademic'
  | 'assistant.actionAcademicTone'
  | 'assistant.actionExplain'
  | 'assistant.actionCustom';

export interface AiActionDefinition {
  id: string;
  category: AiActionCategory;
  task: AiTaskId;
  labelKey: AiActionLabelKey;
  icon: LucideIcon;
}

/**
 * Built-in assistant actions. Custom presets reuse the `custom` task with a
 * user-supplied instruction instead of adding a task per preset.
 *
 * Translation is intentionally absent: it lives in the editor toolbar
 * translator so both tools do not duplicate that workflow.
 */
export const AI_ACTIONS: readonly AiActionDefinition[] = [
  {
    id: 'proofread',
    category: 'improve',
    task: 'proofread',
    labelKey: 'assistant.actionProofread',
    icon: SpellCheck,
  },
  {
    id: 'rewrite',
    category: 'improve',
    task: 'rewrite',
    labelKey: 'assistant.actionRewrite',
    icon: PenLine,
  },
  {
    id: 'cleanup',
    category: 'improve',
    task: 'cleanup',
    labelKey: 'assistant.actionCleanup',
    icon: Eraser,
  },
  {
    id: 'simplify',
    category: 'improve',
    task: 'simplify',
    labelKey: 'assistant.actionSimplify',
    icon: Lightbulb,
  },
  {
    id: 'summarize',
    category: 'process',
    task: 'summarize',
    labelKey: 'assistant.actionSummarize',
    icon: ListChecks,
  },
  {
    id: 'keypoints',
    category: 'process',
    task: 'keypoints',
    labelKey: 'assistant.actionKeypoints',
    icon: ListOrdered,
  },
  {
    id: 'bullets',
    category: 'process',
    task: 'bullets',
    labelKey: 'assistant.actionBullets',
    icon: List,
  },
  {
    id: 'academic',
    category: 'academic',
    task: 'academic',
    labelKey: 'assistant.actionAcademic',
    icon: GraduationCap,
  },
  {
    id: 'academicTone',
    category: 'academic',
    task: 'academic-tone',
    labelKey: 'assistant.actionAcademicTone',
    icon: BookOpen,
  },
  {
    id: 'explain',
    category: 'academic',
    task: 'explain',
    labelKey: 'assistant.actionExplain',
    icon: Lightbulb,
  },
  {
    id: 'custom',
    category: 'custom',
    task: 'custom',
    labelKey: 'assistant.actionCustom',
    icon: PenLine,
  },
];

export const AI_CATEGORY_LABEL_KEYS: Record<
  AiActionCategory,
  | 'assistant.categoryImprove'
  | 'assistant.categoryProcess'
  | 'assistant.categoryAcademic'
  | 'assistant.categoryCustom'
> = {
  improve: 'assistant.categoryImprove',
  process: 'assistant.categoryProcess',
  academic: 'assistant.categoryAcademic',
  custom: 'assistant.categoryCustom',
};

export function getAiAction(id: string): AiActionDefinition | undefined {
  return AI_ACTIONS.find((action) => action.id === id);
}

/** Favorites in the user's saved order, ignoring ids that no longer exist. */
export function resolveFavoriteActions(favoriteIds: readonly string[]): AiActionDefinition[] {
  const seen = new Set<string>();
  const favorites: AiActionDefinition[] = [];
  for (const id of favoriteIds) {
    if (seen.has(id)) {
      continue;
    }
    const action = getAiAction(id);
    if (action) {
      seen.add(id);
      favorites.push(action);
    }
  }
  return favorites;
}

export { DEFAULT_AI_FAVORITE_ACTIONS };

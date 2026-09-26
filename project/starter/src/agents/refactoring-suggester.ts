import {
  RefactoringSuggestionJSONSchema
} from '../types/analysis-results.js';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/index.js';

export const refactoringSuggester = {
  model: 'inherit' as const,
  description: 'Suggests practical refactoring improvements for readability and maintainability.',
  prompt: REFACTORING_SUGGESTER_PROMPT,
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  outputFormat: {
    type: 'json_schema' as const,
    schema: RefactoringSuggestionJSONSchema
  }
};

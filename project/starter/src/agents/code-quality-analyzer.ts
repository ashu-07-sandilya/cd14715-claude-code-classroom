import {
  CodeQualityResultJSONSchema
} from '../types/analysis-results.js';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/index.js';

export const codeQualityAnalyzer = {
  model: 'inherit' as const,
  description: 'Analyzes code quality, security, performance, maintainability, and bug risks.',
  prompt: CODE_QUALITY_ANALYZER_PROMPT,
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  outputFormat: {
    type: 'json_schema' as const,
    schema: CodeQualityResultJSONSchema
  }
};

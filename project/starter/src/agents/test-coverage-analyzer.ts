import {
  TestCoverageResultJSONSchema
} from '../types/analysis-results.js';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/index.js';

export const testCoverageAnalyzer = {
  model: 'inherit' as const,
  description: 'Analyzes test coverage and identifies important untested paths.',
  prompt: TEST_COVERAGE_ANALYZER_PROMPT,
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  outputFormat: {
    type: 'json_schema' as const,
    schema: TestCoverageResultJSONSchema
  }
};

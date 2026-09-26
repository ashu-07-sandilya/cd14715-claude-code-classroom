import { query } from '@anthropic-ai/claude-agent-sdk';
import { ReviewReport, ReviewReportSchema, ReviewReportJSONSchema } from './types/report-types.js';
import { mcpServersConfig } from './config/mcp.config.js';
import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester
} from './agents/index.js';
import { ORCHESTRATOR_PROMPT } from './prompts/orchestrator.prompt.js';
import { withTimeout, withRetry } from './utils/error-handler.js';
import { ErrorCodes, ReviewError } from './utils/error-handler.js';

export interface OrchestratorOptions {
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class CodeReviewOrchestrator {
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: OrchestratorOptions = {}) {
    this.model =
      options.model ||
      process.env.ANTHROPIC_MODEL ||
      'claude-sonnet-4-5-20250929';

    this.timeoutMs = options.timeoutMs ?? 120000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startTime = Date.now();

    const prompt = ORCHESTRATOR_PROMPT(owner, repo, prNumber);

    const result = await withRetry(
      () =>
        withTimeout(
          async () => {
            let finalResult: unknown = undefined;

            for await (const message of query({
              prompt,
              options: {
                model: this.model,
                mcpServers: mcpServersConfig,
                agents: {
                  'code-quality-analyzer': codeQualityAnalyzer,
                  'test-coverage-analyzer': testCoverageAnalyzer,
                  'refactoring-suggester': refactoringSuggester
                },
                allowedTools: [
                  'Read',
                  'Grep',
                  'Glob',
                  'Task',
                  'mcp__github__get_pull_request',
                  'mcp__github__list_pull_requests',
                  'mcp__github__get_pull_request_files',
                  'mcp__github__get_pull_request_status',
                  'mcp__github__get_pull_request_comments',
                  'mcp__github__get_pull_request_reviews'
                ],
                outputFormat: {
                  type: 'json_schema',
                  schema: ReviewReportJSONSchema
                },
                maxTurns: 20
              }
            })) {
              if (message.type === 'result') {
                if (message.subtype !== 'success') {
                  throw new ReviewError(
                    `Review failed with subtype: ${message.subtype}`,
                    ErrorCodes.AGENT_FAILED,
                    { owner, repo, prNumber }
                  );
                }

                finalResult = message.structured_output;
              }
            }

            if (!finalResult) {
              throw new ReviewError(
                'No structured review result was returned',
                ErrorCodes.STRUCTURED_OUTPUT_FAILED,
                { owner, repo, prNumber }
              );
            }

            const validated = ReviewReportSchema.safeParse(finalResult);

            if (!validated.success) {
              throw new ReviewError(
                'Structured review output failed validation',
                ErrorCodes.VALIDATION_FAILED,
                {
                  issues: validated.error.issues
                }
              );
            }

            return {
              ...validated.data,
              metadata: {
                ...validated.data.metadata,
                duration: Date.now() - startTime
              }
            };
          },
          this.timeoutMs,
          `Code review timed out after ${this.timeoutMs}ms`
        ),
      this.maxRetries
    );

    return result;
  }
}

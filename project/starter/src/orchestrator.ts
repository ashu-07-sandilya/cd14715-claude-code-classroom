import { query } from '@anthropic-ai/claude-agent-sdk';
import { ReviewReport, ReviewReportSchema, ReviewReportJSONSchema } from './types/report-types.js';
import { mcpServersConfig } from './config/mcp.config.js';
import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester
} from './agents/index.js';
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

    const prompt = `
Review GitHub pull request ${owner}/${repo}#${prNumber}.

First inspect the pull request and its changed files using the GitHub MCP server.

For each relevant changed source file, perform all three analyses:
1. Code quality analysis
2. Test coverage analysis
3. Refactoring analysis

Run these analyses in parallel where possible.

Then aggregate all results into ONE final ReviewReport.

The final response MUST conform exactly to the provided ReviewReport JSON schema.

The pull request information must be:
- owner: ${owner}
- repo: ${repo}
- number: ${prNumber}

Do not invent files or analysis results.
`;

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

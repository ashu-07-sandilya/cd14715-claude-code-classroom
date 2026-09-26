/**
 * Main orchestrator prompt
 *
 * Coordinates the three specialized code-review agents and
 * requires the final response to conform to ReviewReportSchema.
 */

export const ORCHESTRATOR_PROMPT = (
  owner: string,
  repo: string,
  prNumber: number
): string => `
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

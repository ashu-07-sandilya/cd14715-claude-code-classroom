import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach
} from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn()
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery
}));

vi.mock('../src/config/mcp.config.js', () => ({
  mcpServersConfig: {
    github: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {}
    },
    eslint: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@eslint/mcp@latest'],
      env: {}
    }
  }
}));

vi.mock('../src/agents/index.js', () => ({
  codeQualityAnalyzer: {
    description: 'Code quality analyzer',
    prompt: 'Analyze code quality',
    tools: ['Read', 'Grep', 'Glob'],
    outputFormat: {
      type: 'json_schema',
      schema: {}
    }
  },
  testCoverageAnalyzer: {
    description: 'Test coverage analyzer',
    prompt: 'Analyze test coverage',
    tools: ['Read', 'Grep', 'Glob'],
    outputFormat: {
      type: 'json_schema',
      schema: {}
    }
  },
  refactoringSuggester: {
    description: 'Refactoring suggester',
    prompt: 'Suggest refactorings',
    tools: ['Read', 'Grep', 'Glob'],
    outputFormat: {
      type: 'json_schema',
      schema: {}
    }
  }
}));

import { CodeReviewOrchestrator } from '../src/orchestrator.js';

const validReviewReport = {
  pullRequest: {
    owner: 'pallets',
    repo: 'flask',
    number: 6135
  },
  fileReviews: [
    {
      file: 'src/example.ts',
      codeQuality: {
        file: 'src/example.ts',
        issues: [],
        overallScore: 90,
        summary: 'No significant issues found'
      },
      testCoverage: {
        file: 'src/example.ts',
        hasTests: true,
        testFiles: ['tests/example.test.ts'],
        untestedPaths: [],
        coverageEstimate: 90,
        summary: 'Good test coverage'
      },
      refactorings: {
        file: 'src/example.ts',
        suggestions: [],
        summary: 'No refactoring required'
      }
    }
  ],
  summary: {
    totalFiles: 1,
    overallScore: 90,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0
  },
  recommendations: [],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 0,
    agentVersions: {
      'code-quality-analyzer': 'test',
      'test-coverage-analyzer': 'test',
      'refactoring-suggester': 'test'
    }
  }
};

function mockSuccessfulQuery() {
  mockQuery.mockReturnValue(
    (async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        structured_output: validReviewReport
      };
    })()
  );
}

describe('CodeReviewOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should initialize with default options', () => {
      const orchestrator = new CodeReviewOrchestrator();

      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });

    it('should accept custom options', async () => {
      mockSuccessfulQuery();

      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
        timeoutMs: 5000,
        maxRetries: 1
      });

      const result = await orchestrator.reviewPullRequest(
        'pallets',
        'flask',
        6135
      );

      expect(result.pullRequest).toEqual({
        owner: 'pallets',
        repo: 'flask',
        number: 6135
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('reviewPullRequest', () => {
    it('should call the Claude Agent SDK query', async () => {
      mockSuccessfulQuery();

      const orchestrator = new CodeReviewOrchestrator({
        maxRetries: 1
      });

      await orchestrator.reviewPullRequest(
        'pallets',
        'flask',
        6135
      );

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should include the pull request information in the prompt', async () => {
      mockSuccessfulQuery();

      const orchestrator = new CodeReviewOrchestrator({
        maxRetries: 1
      });

      await orchestrator.reviewPullRequest(
        'pallets',
        'flask',
        6135
      );

      const [queryArgument] = mockQuery.mock.calls[0];

      expect(queryArgument.prompt).toContain(
        'pallets/flask#6135'
      );
    });

    it('should configure all three subagents', async () => {
      mockSuccessfulQuery();

      const orchestrator = new CodeReviewOrchestrator({
        maxRetries: 1
      });

      await orchestrator.reviewPullRequest(
        'pallets',
        'flask',
        6135
      );

      const [queryArgument] = mockQuery.mock.calls[0];

      expect(
        queryArgument.options.agents
      ).toHaveProperty('code-quality-analyzer');

      expect(
        queryArgument.options.agents
      ).toHaveProperty('test-coverage-analyzer');

      expect(
        queryArgument.options.agents
      ).toHaveProperty('refactoring-suggester');
    });

    it('should aggregate and return the structured ReviewReport', async () => {
      mockSuccessfulQuery();

      const orchestrator = new CodeReviewOrchestrator({
        maxRetries: 1
      });

      const result = await orchestrator.reviewPullRequest(
        'pallets',
        'flask',
        6135
      );

      expect(result.pullRequest.owner).toBe('pallets');
      expect(result.pullRequest.repo).toBe('flask');
      expect(result.pullRequest.number).toBe(6135);

      expect(result.fileReviews).toHaveLength(1);
      expect(result.summary.totalFiles).toBe(1);
    });

    it('should reject invalid structured output', async () => {
      mockQuery.mockReturnValue(
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            structured_output: {
              invalid: true
            }
          };
        })()
      );

      const orchestrator = new CodeReviewOrchestrator({
        maxRetries: 1
      });

      await expect(
        orchestrator.reviewPullRequest(
          'pallets',
          'flask',
          6135
        )
      ).rejects.toThrow('Structured review output failed validation');
    });

    it('should retry when the review operation fails', async () => {
      let attempts = 0;

      mockQuery.mockImplementation(() => {
        attempts++;

        if (attempts === 1) {
          return (async function* () {
            yield {
              type: 'result',
              subtype: 'error',
              structured_output: undefined
            };
          })();
        }

        return (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            structured_output: validReviewReport
          };
        })();
      });

      const orchestrator = new CodeReviewOrchestrator({
        maxRetries: 2
      });

      const result = await orchestrator.reviewPullRequest(
        'pallets',
        'flask',
        6135
      );

      expect(attempts).toBe(2);
      expect(result.pullRequest.number).toBe(6135);
    });
  });

  describe('Integration', () => {
    it.skip('should review a real small PR', async () => {
      // Requires real GitHub MCP and API credentials.
    });
  });
});
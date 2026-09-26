import { describe, expect, it } from 'vitest';
import {
  ReviewReportSchema,
  ReviewReportJSONSchema
} from '../src/types/report-types.js';

describe('ReviewReportSchema', () => {
  const validReport = {
    pullRequest: {
      owner: 'airamane',
      repo: 'simple-todo-app',
      number: 1
    },

    fileReviews: [
      {
        file: 'src/todo.js',

        codeQuality: {
          file: 'src/todo.js',
          issues: [
            {
              line: 10,
              severity: 'medium' as const,
              category: 'maintainability' as const,
              description: 'Example maintainability issue',
              suggestion: 'Extract this logic into a helper function'
            }
          ],
          overallScore: 85,
          summary: 'Generally good code quality'
        },

        testCoverage: {
          file: 'src/todo.js',
          hasTests: true,
          testFiles: ['test/todo.test.js'],
          untestedPaths: [
            {
              type: 'edge-case' as const,
              location: 'src/todo.js:25',
              priority: 'medium' as const,
              reasoning: 'An empty input case is not covered',
              suggestedTest: 'Add a test for empty input'
            }
          ],
          coverageEstimate: 80,
          summary: 'Good coverage with a few edge cases missing'
        },

        refactorings: {
          file: 'src/todo.js',
          suggestions: [
            {
              type: 'extract-function' as const,
              location: 'src/todo.js:10-20',
              impact: 'medium' as const,
              description: 'Extract repeated logic',
              before: 'Repeated logic inside the main function',
              after: 'Use a dedicated helper function',
              benefits: 'Improves readability and maintainability'
            }
          ],
          summary: 'A small refactoring opportunity was identified'
        }
      }
    ],

    summary: {
      totalFiles: 1,
      overallScore: 85,
      criticalIssues: 0,
      highPriorityTests: 1,
      refactoringOpportunities: 1
    },

    recommendations: [
      {
        priority: 'medium' as const,
        category: 'maintainability',
        description: 'Extract repeated logic into a helper',
        files: ['src/todo.js']
      }
    ],

    metadata: {
      analyzedAt: '2026-09-27T00:00:00.000Z',
      duration: 1500,
      agentVersions: {
        'code-quality-analyzer': '1.0.0',
        'test-coverage-analyzer': '1.0.0',
        'refactoring-suggester': '1.0.0'
      }
    }
  };

  it('should accept valid report data', () => {
    const result = ReviewReportSchema.safeParse(validReport);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.pullRequest.owner).toBe('airamane');
      expect(result.data.pullRequest.repo).toBe('simple-todo-app');
      expect(result.data.summary.overallScore).toBe(85);
    }
  });

  it('should reject invalid report data', () => {
    const invalidReport = {
      ...validReport,
      pullRequest: {
        ...validReport.pullRequest,
        number: 'not-a-number'
      }
    };

    const result = ReviewReportSchema.safeParse(invalidReport);

    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const invalidReport = {
      ...validReport,
      summary: {
        totalFiles: 1,
        overallScore: 85,
        criticalIssues: 0,
        highPriorityTests: 1
        // refactoringOpportunities intentionally missing
      }
    };

    const result = ReviewReportSchema.safeParse(invalidReport);

    expect(result.success).toBe(false);
  });

  it('should reject invalid enum values', () => {
    const invalidReport = {
      ...validReport,
      recommendations: [
        {
          priority: 'urgent',
          category: 'security',
          description: 'Invalid priority',
          files: ['src/todo.js']
        }
      ]
    };

    const result = ReviewReportSchema.safeParse(invalidReport);

    expect(result.success).toBe(false);
  });

  it('should reject scores outside the 0-100 range', () => {
    const invalidReport = {
      ...validReport,
      fileReviews: [
        {
          ...validReport.fileReviews[0],
          codeQuality: {
            ...validReport.fileReviews[0].codeQuality,
            overallScore: 101
          }
        }
      ]
    };

    const result = ReviewReportSchema.safeParse(invalidReport);

    expect(result.success).toBe(false);
  });

  it('should accept empty arrays', () => {
    const reportWithEmptyArrays = {
      ...validReport,
      fileReviews: [],
      recommendations: []
    };

    const result = ReviewReportSchema.safeParse(reportWithEmptyArrays);

    expect(result.success).toBe(true);
  });

  it('should accept boundary scores of 0 and 100', () => {
    const boundaryReport = {
      ...validReport,
      fileReviews: [
        {
          ...validReport.fileReviews[0],
          codeQuality: {
            ...validReport.fileReviews[0].codeQuality,
            overallScore: 0
          },
          testCoverage: {
            ...validReport.fileReviews[0].testCoverage,
            coverageEstimate: 100
          }
        }
      ]
    };

    const result = ReviewReportSchema.safeParse(boundaryReport);

    expect(result.success).toBe(true);
  });

  it('should validate optional-looking empty collections correctly', () => {
    const report = {
      ...validReport,
      fileReviews: [
        {
          ...validReport.fileReviews[0],
          codeQuality: {
            ...validReport.fileReviews[0].codeQuality,
            issues: []
          },
          testCoverage: {
            ...validReport.fileReviews[0].testCoverage,
            testFiles: [],
            untestedPaths: []
          },
          refactorings: {
            ...validReport.fileReviews[0].refactorings,
            suggestions: []
          }
        }
      ]
    };

    const result = ReviewReportSchema.safeParse(report);

    expect(result.success).toBe(true);
  });

  it('should export a JSON Schema with the required top-level properties', () => {
    expect(ReviewReportJSONSchema).toBeDefined();
    expect(typeof ReviewReportJSONSchema).toBe('object');

    const schema = ReviewReportJSONSchema as Record<string, any>;

    expect(schema.properties).toBeDefined();
    expect(schema.properties.pullRequest).toBeDefined();
    expect(schema.properties.fileReviews).toBeDefined();
    expect(schema.properties.summary).toBeDefined();
    expect(schema.properties.recommendations).toBeDefined();
    expect(schema.properties.metadata).toBeDefined();
  });

  it('should mark the required top-level properties in the JSON Schema', () => {
    const schema = ReviewReportJSONSchema as Record<string, any>;

    expect(schema.required).toEqual(
      expect.arrayContaining([
        'pullRequest',
        'fileReviews',
        'summary',
        'recommendations',
        'metadata'
      ])
    );
  });
});

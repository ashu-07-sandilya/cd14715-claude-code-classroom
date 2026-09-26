import * as dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';

dotenv.config();

async function main() {
  const [owner, repo, prStr] = process.argv.slice(2);

  // Validate command-line arguments
  if (!owner || !repo || !prStr) {
    console.error('Usage: npm run dev <owner> <repo> <pr-number>');
    process.exit(1);
  }

  const prNumber = Number(prStr);

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    console.error('PR number must be a positive integer.');
    process.exit(1);
  }

  // Validate authentication
  const hasAnthropicApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasAwsCredentials =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY);

  if (hasAnthropicApiKey) {
    console.log('🔐 Using Anthropic API authentication');
  } else if (hasAwsCredentials) {
    if (!process.env.AWS_REGION) {
      console.error(
        'AWS_REGION is required when using AWS Bedrock authentication.'
      );
      process.exit(1);
    }

    console.log('🔐 Using AWS Bedrock authentication');
  } else {
    console.error(
      'Authentication not configured.\n' +
      'Set either ANTHROPIC_API_KEY or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY.'
    );
    process.exit(1);
  }

  // Validate model
  const model = process.env.ANTHROPIC_MODEL;

  if (!model) {
    console.error(
      'ANTHROPIC_MODEL is required.\n' +
      'Anthropic API: claude-sonnet-4-5-20250929\n' +
      'AWS Bedrock: us.anthropic.claude-sonnet-4-5-20250929-v1:0'
    );
    process.exit(1);
  }

  console.log(`🔍 Reviewing ${owner}/${repo}#${prNumber}`);
  console.log(`🤖 Model: ${model}`);

  try {
    const orchestrator = new CodeReviewOrchestrator({
      model
    });

    const report = await orchestrator.reviewPullRequest(
      owner,
      repo,
      prNumber
    );

    const generator = new ReportGenerator();

    const markdown = generator.generateMarkdownReport(report);
    const html = generator.generateHTMLReport(report);
    const json = generator.generateJSONReport(report);

    await mkdir('reports', { recursive: true });

    const baseName = `${owner}-${repo}-pr-${prNumber}`;

    await writeFile(
      `reports/${baseName}.md`,
      markdown,
      'utf8'
    );

    await writeFile(
      `reports/${baseName}.html`,
      html,
      'utf8'
    );

    await writeFile(
      `reports/${baseName}.json`,
      json,
      'utf8'
    );

    console.log('\n✅ Review completed successfully!');
    console.log(`📄 Markdown: reports/${baseName}.md`);
    console.log(`🌐 HTML:     reports/${baseName}.html`);
    console.log(`📋 JSON:     reports/${baseName}.json`);
  } catch (error) {
    console.error('❌ Review failed:', error);
    process.exit(1);
  }
}

main();

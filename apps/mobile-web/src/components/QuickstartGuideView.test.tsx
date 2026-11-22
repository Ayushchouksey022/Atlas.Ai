import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuickstartGuideView, type GuideData } from './QuickstartGuideView';
import { ThemeProvider } from '../design-system/ThemeContext';

describe('QuickstartGuideView Component (Prompt 13 / PRD 10.4)', () => {
  const sampleMarkdown = `
## Goal
Master Cursor background agentic multi-file refactoring in 20 minutes.

## Prerequisites
- Node.js 20+
- Git repository initialized

## Steps
### Step 1: Install Cursor IDE (~3 min)
Download and install the Cursor desktop application.
\`\`\`bash
brew install --cask cursor
\`\`\`

### Step 2: Open Workspace (~4 min)
Open your project repository in Cursor.
\`\`\`bash
cursor .
\`\`\`

### Step 3: Configure Agent Permissions (~4 min)
Allow agent terminal access in settings.

### Step 4: Execute Multi-File Refactor (~5 min)
Press Command+I and prompt the agent to update modules.
\`\`\`bash
cursor-agent --run
\`\`\`

### Step 5: Review Diff (~4 min)
Inspect the generated changes before committing.
\`\`\`bash
git diff
\`\`\`

## Verify it worked
All unit tests should pass with zero exit codes.

## Common Pitfalls
- Running agent in untrusted directories
- Missing environment keys

## Source Documentation
- [https://docs.cursor.com/agent](https://docs.cursor.com/agent)
`.trim();

  const renderView = (props: React.ComponentProps<typeof QuickstartGuideView>) => {
    return renderToStaticMarkup(
      <ThemeProvider>
        <QuickstartGuideView {...props} />
      </ThemeProvider>,
    );
  };

  it('1. Approved-Only Visibility: Shows "In Review" and docs link when status is draft or guide is missing', () => {
    const draftGuide: GuideData = {
      id: 'guide-draft-1',
      node_id: 'node-1',
      markdown: sampleMarkdown,
      status: 'draft', // DRAFT
      last_verified_at: new Date().toISOString(),
      source_urls: ['https://docs.cursor.com/agent'],
    };

    // A. Render with status = draft
    const html = renderView({
      nodeId: 'node-1',
      nodeName: 'Cursor Agent',
      externalUrl: 'https://docs.cursor.com',
      guide: draftGuide,
    });

    // Assert "Guide in review" is displayed
    expect(html).toContain('In Review');
    expect(html).toContain('View Official Documentation ↗');

    // Assert approved guide elements (e.g. "Last verified", Steps) are NOT rendered
    expect(html).not.toContain('Last verified');
    expect(html).not.toContain('Master Cursor background agentic multi-file refactoring in 20 minutes.');
  });

  it('2. Approved-Only Visibility: Shows full approved guide with "Last verified" label when status = approved', () => {
    const approvedGuide: GuideData = {
      id: 'guide-approved-1',
      node_id: 'node-1',
      markdown: sampleMarkdown,
      status: 'approved', // APPROVED
      last_verified_at: '2026-11-20T10:00:00.000Z',
      source_urls: ['https://docs.cursor.com/agent'],
    };

    const html = renderView({
      nodeId: 'node-1',
      nodeName: 'Cursor Agent',
      externalUrl: 'https://docs.cursor.com',
      guide: approvedGuide,
    });

    // Verify "In Review" is NOT shown
    expect(html).not.toContain('In Review');

    // Verify "Last verified" label
    expect(html).toContain('Last verified:');

    // Verify Goal
    expect(html).toContain('Master Cursor background agentic multi-file refactoring in 20 minutes.');

    // Verify Prerequisites
    expect(html).toContain('Node.js 20+');
    expect(html).toContain('Git repository initialized');

    // Verify Steps
    expect(html).toContain('Step 1: Install Cursor IDE');
    expect(html).toContain('brew install --cask cursor');
    expect(html).toContain('Step 5: Review Diff');

    // Verify Verification, Pitfalls, and Sources
    expect(html).toContain('All unit tests should pass with zero exit codes.');
    expect(html).toContain('Running agent in untrusted directories');
    expect(html).toContain('https://docs.cursor.com/agent');
  });

  it('3. Loading State: Shows loading indicator message when isLoading is true', () => {
    const html = renderView({
      nodeId: 'node-1',
      nodeName: 'Cursor Agent',
      isLoading: true,
    });

    expect(html).toContain('Loading quickstart guide...');
  });
});

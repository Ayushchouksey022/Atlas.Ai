import type { QuickstartGuideOutput } from '@repo/schemas';

/**
 * Formats a validated QuickstartGuideOutput into clean, safe markdown.
 * Structure:
 * - Goal (1 line)
 * - Prerequisites (bullet points)
 * - Numbered Steps (5-8 steps with minute estimates, instructions, and code snippets)
 * - Verify it worked
 * - Common Pitfalls
 * - Sources
 */
export function formatGuideToMarkdown(guide: QuickstartGuideOutput): string {
  const sections: string[] = [];

  // 1. Goal (PRD 10.4: exactly 1 line)
  sections.push(`## Goal\n${guide.goal.trim()}`);

  // 2. Prerequisites
  if (guide.prerequisites.length > 0) {
    const prereqList = guide.prerequisites.map((p) => `- ${p.trim()}`).join('\n');
    sections.push(`## Prerequisites\n${prereqList}`);
  }

  // 3. Numbered Steps (5 to 8 steps)
  const stepsText = guide.steps
    .map((step) => {
      let stepStr = `### Step ${step.step_number}: ${step.title.trim()} (~${step.estimated_minutes} min)\n${step.instruction.trim()}`;
      if (step.code_snippet) {
        stepStr += `\n\n\`\`\`bash\n${step.code_snippet.trim()}\n\`\`\``;
      }
      return stepStr;
    })
    .join('\n\n');
  sections.push(`## Steps\n${stepsText}`);

  // 4. Verify it worked
  sections.push(`## Verify it worked\n${guide.verification.trim()}`);

  // 5. Common Pitfalls
  if (guide.common_pitfalls.length > 0) {
    const pitfallsList = guide.common_pitfalls.map((p) => `- ${p.trim()}`).join('\n');
    sections.push(`## Common Pitfalls\n${pitfallsList}`);
  }

  // 6. Source Links
  if (guide.source_links.length > 0) {
    const linksList = guide.source_links.map((link) => `- [${link.trim()}](${link.trim()})`).join('\n');
    sections.push(`## Source Documentation\n${linksList}`);
  }

  return sections.join('\n\n');
}

/**
 * Strips HTML tags, script, and style blocks to produce clean plain text for the LLM.
 */
export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

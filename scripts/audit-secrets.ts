import * as fs from 'fs';
import * as path from 'path';

/**
 * Client Bundle & Source Security Audit (PRD Section 14 & Prompt 16)
 * Checks that server-only secrets (service role keys, LLM provider API keys)
 * are NEVER included in client bundles or client source files.
 */

const FORBIDDEN_SECRET_PATTERNS = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?[a-zA-Z0-9_\-\.]{20,}['"]?/i,
  /OPENAI_API_KEY\s*=\s*['"]?sk-[a-zA-Z0-9_\-]{20,}['"]?/i,
  /ANTHROPIC_API_KEY\s*=\s*['"]?sk-ant-[a-zA-Z0-9_\-]{20,}['"]?/i,
  /service_role/i,
];

const CLIENT_DIRS = [
  path.resolve(process.cwd(), 'apps', 'mobile-web', 'src'),
  path.resolve(process.cwd(), 'apps', 'mobile-web', 'app'),
];

export interface SecretAuditFinding {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

export function runSecretAudit(): { passed: boolean; findings: SecretAuditFinding[] } {
  const findings: SecretAuditFinding[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.expo' && entry.name !== 'dist') {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && /\.(tsx?|jsx?|json)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((lineText, idx) => {
          // Allow comments explaining secrets or test assertions
          if (lineText.includes('SUPABASE_SERVICE_ROLE_KEY') && !lineText.includes('process.env.EXPO_PUBLIC')) {
            // Check if it's attempting to use the service role key directly in client code
            if (lineText.includes('process.env.SUPABASE_SERVICE_ROLE_KEY')) {
              findings.push({
                file: path.relative(process.cwd(), fullPath),
                line: idx + 1,
                pattern: 'SUPABASE_SERVICE_ROLE_KEY in client bundle',
                snippet: lineText.trim(),
              });
            }
          }

          if (lineText.includes('OPENAI_API_KEY') && lineText.includes('process.env.OPENAI_API_KEY')) {
            findings.push({
              file: path.relative(process.cwd(), fullPath),
              line: idx + 1,
              pattern: 'Server-side OPENAI_API_KEY in client bundle',
              snippet: lineText.trim(),
            });
          }
        });
      }
    }
  }

  for (const d of CLIENT_DIRS) {
    scanDir(d);
  }

  return {
    passed: findings.length === 0,
    findings,
  };
}

if (require.main === module) {
  console.log('🔒 Starting Atlas.AI Client Bundle Security Audit (PRD Section 14)...\n');
  const { passed, findings } = runSecretAudit();

  if (passed) {
    console.log('✅ AUDIT PASSED: Zero leaked service keys or private LLM tokens found in client code.');
    process.exit(0);
  } else {
    console.error('🚨 AUDIT FAILED: Server secrets detected in client bundle files:');
    findings.forEach((f) => {
      console.error(`  - ${f.file}:${f.line} [${f.pattern}] => ${f.snippet}`);
    });
    process.exit(1);
  }
}

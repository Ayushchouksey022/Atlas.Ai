import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCanonicalGraphFile, printValidationReport } from '../packages/graph/src/validate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedDir = path.resolve(__dirname, '../supabase/seed/canonical-graph');
const files = fs.readdirSync(seedDir).filter((f: string) => f.endsWith('.json'));

let anyFailed = false;
for (const file of files) {
  const fullPath = path.join(seedDir, file);
  const report = validateCanonicalGraphFile(fullPath);
  printValidationReport(report);
  if (!report.valid) anyFailed = true;
}

if (anyFailed) {
  process.exit(1);
} else {
  process.exit(0);
}

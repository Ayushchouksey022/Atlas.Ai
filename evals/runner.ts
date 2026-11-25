import { runEvaluation, formatEvalReport } from './harness';
import type { EvalOptions } from '../packages/llm/src/evals/types';

async function main() {
  const args = process.argv.slice(2);
  const options: EvalOptions = {
    gate: args.includes('--gate'),
    verbose: args.includes('--verbose'),
  };

  // Parse --provider=<name>
  const providerArg = args.find((a) => a.startsWith('--provider='));
  if (providerArg) {
    const val = providerArg.split('=')[1] as 'mock' | 'openai' | 'anthropic' | 'gemini';
    options.providerName = val;
  }

  // Parse --min=<pct>
  const minArg = args.find((a) => a.startsWith('--min='));
  if (minArg) {
    options.minAgreementPct = parseFloat(minArg.split('=')[1]);
  } else {
    options.minAgreementPct = 90;
  }

  try {
    console.log(`Starting Atlas.AI Red Button Golden Set Evaluation...\n`);
    const report = await runEvaluation(options);
    const formatted = formatEvalReport(report);
    console.log(formatted);

    // Release Gate Enforcement (PRD Section 2)
    if (options.gate) {
      const threshold = options.minAgreementPct || 90;
      if (report.overall_agreement_pct < threshold) {
        console.error(
          `\n🚨 RELEASE GATE FAILURE: Overall agreement (${report.overall_agreement_pct}%) is below the required ${threshold}% threshold. Blocking release.`,
        );
        process.exit(1);
      } else {
        console.log(
          `\n✨ RELEASE GATE PASSED: Overall agreement (${report.overall_agreement_pct}%) meets or exceeds the ${threshold}% threshold. Ready for deployment.`,
        );
        process.exit(0);
      }
    }
  } catch (err) {
    console.error(`\n❌ Evaluation execution error:`, err);
    process.exit(1);
  }
}

main();

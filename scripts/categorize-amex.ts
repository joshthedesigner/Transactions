/**
 * Script to categorize Amex transactions using ML model trained on Chase data
 * 
 * Usage:
 *   npx tsx scripts/categorize-amex.ts [--apply] [--low-confidence]
 * 
 * Options:
 *   --apply: Apply high-confidence predictions to database
 *   --low-confidence: Also apply low-confidence predictions (use with caution)
 */

import { categorizeAmexTransactions } from '../lib/ml/categorize-amex';
import { createClient } from '../lib/supabase/server';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');
  const includeLowConfidence = args.includes('--low-confidence');

  console.log('🚀 Starting Amex Transaction Categorization\n');

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Not authenticated. Please ensure you are logged in.');
    }

    console.log(`👤 User: ${user.email}\n`);

    // Generate predictions
    const result = await categorizeAmexTransactions(user.id, 0.6);

    // Display summary
    console.log('\n📊 PREDICTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Uncategorized: ${result.summary.totalUncategorized}`);
    console.log(`Predictions Generated: ${result.summary.predictionsGenerated}`);
    console.log(`High Confidence (>= 60%): ${result.summary.highConfidence}`);
    console.log(`Low Confidence (< 60%): ${result.summary.lowConfidence}`);
    console.log('='.repeat(60));

    // Show low confidence predictions
    if (result.summary.lowConfidencePredictions.length > 0) {
      console.log('\n⚠️  LOW CONFIDENCE PREDICTIONS (Review Before Applying):');
      console.log('-'.repeat(60));
      result.summary.lowConfidencePredictions.slice(0, 10).forEach((p) => {
        console.log(
          `ID: ${p.transactionId} | Category: ${p.predictedCategoryName} | Confidence: ${(p.confidence * 100).toFixed(1)}%`
        );
      });
      if (result.summary.lowConfidencePredictions.length > 10) {
        console.log(`... and ${result.summary.lowConfidencePredictions.length - 10} more`);
      }
    }

    // Save SQL and TypeScript files
    const outputDir = join(process.cwd(), 'scripts', 'output');
    writeFileSync(join(outputDir, 'amex-categorization-updates.sql'), result.updateSQL);
    writeFileSync(join(outputDir, 'amex-categorization-updates.ts'), result.updateTypeScript);
    console.log('\n💾 Generated files:');
    console.log(`  - scripts/output/amex-categorization-updates.sql`);
    console.log(`  - scripts/output/amex-categorization-updates.ts`);

    // Apply predictions if requested
    if (shouldApply) {
      console.log('\n🔄 Applying predictions to database...');

      const updatesToApply = includeLowConfidence
        ? result.predictions
        : result.predictions.filter((p) => !p.lowConfidence);

      let updated = 0;
      let failed = 0;

      for (const prediction of updatesToApply) {
        const { error } = await supabase
          .from('transactions_v2')
          .update({ category_id: prediction.predictedCategoryId })
          .eq('id', prediction.transactionId)
          .eq('user_id', user.id);

        if (error) {
          console.error(`❌ Failed to update transaction ${prediction.transactionId}:`, error.message);
          failed++;
        } else {
          updated++;
        }
      }

      console.log(`\n✅ Successfully updated ${updated} transactions`);
      if (failed > 0) {
        console.log(`❌ Failed to update ${failed} transactions`);
      }
    } else {
      console.log('\n💡 To apply predictions, run with --apply flag:');
      console.log('   npx tsx scripts/categorize-amex.ts --apply');
      if (result.summary.lowConfidence > 0) {
        console.log('\n⚠️  To also apply low-confidence predictions:');
        console.log('   npx tsx scripts/categorize-amex.ts --apply --low-confidence');
      }
    }

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();


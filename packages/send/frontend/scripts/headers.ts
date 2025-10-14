/**
 * Headers Generation Script
 *
 * This script generates security headers using the CSP configuration
 * and outputs them to a JSON file for use in deployment and testing.
 */

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getHeadersForEnvironment } from '../csp.config.js';

// Get the current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate headers for the specified environment
 */
function generateHeaders() {
  const mode =
    process.env.NODE_ENV === 'production' ? 'production' : 'development';
  // Generate headers using the CSP configuration
  const headers = getHeadersForEnvironment(mode, process.env);

  // Create output structure
  const output = {
    headers: headers,
  };

  return output;
}

/**
 * Write headers to JSON file
 */
function writeHeadersToFile(
  headers: Record<string, unknown>,
  outputPath: string
) {
  try {
    writeFileSync(outputPath, JSON.stringify(headers, null, 2), 'utf8');
    console.log(`✅ Headers written to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Failed to write headers file:`, error);
    process.exit(1);
  }
}

/**
 * Main execution function
 */
function main() {
  const headers = generateHeaders();

  // Output to dist directory (created during build)
  const outputPath = join(__dirname, '..', 'dist', 'headers.json');

  writeHeadersToFile(headers, outputPath);

  // Log the generated CSP for verification
  console.log('📋 Generated Content-Security-Policy:');
  console.log(headers.headers['Content-Security-Policy']);

  console.log('\n🎉 Headers generation complete!');
}

// Execute if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateHeaders, writeHeadersToFile };

/**
 * Setup environment variables for tests
 */

// API key must be set via GEMINI_API_KEY environment variable
// Integration tests will be skipped if not set

// Skip integration tests by default (can be enabled with npm run test:integration)
if (!process.env.RUN_INTEGRATION_TESTS) {
	process.env.SKIP_INTEGRATION_TESTS = 'true';
}

console.log('🔧 Test environment configured');
console.log('  API Key:', process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Not set');
console.log('  Integration tests:', process.env.SKIP_INTEGRATION_TESTS === 'true' ? '⏭️  Skipped' : '▶️  Enabled');


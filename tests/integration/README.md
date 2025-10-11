# Integration Tests

This directory contains integration tests that make real API calls to test all functionality with the actual Gemini API.

## Test Files

1. **gemini-client.integration.test.ts** - Basic integration tests (5 tests, ~9s)
   - List files tool
   - Read file tool
   - Tool execution with follow-up
   - Permission system
   - Function calling format

2. **all-tools.integration.test.ts** - Comprehensive tests for all 7 tools (9 tests, ~80s)
   - Tool 1: read_file
   - Tool 2: list_files
   - Tool 3: read_many_files
   - Tool 4: write_file
   - Tool 5: web_fetch
   - Tool 6: google_web_search
   - Tool 7: save_memory
   - Combined: multiple tools
   - Permissions: mixed permission testing

## Rate Limits

⚠️ **Important**: These tests make real API calls and are subject to Gemini API rate limits:

- **Free tier**: 10 requests per minute
- **Tests include delays**: 7 seconds between each test to respect limits
- **Total time**: The comprehensive suite takes ~80 seconds due to rate limiting

## Running Tests

### Run all integration tests:
```bash
npm run test:integration
```

### Run only basic integration tests (faster):
```bash
npm run test:integration -- --testPathPattern=gemini-client
```

### Run comprehensive tool tests (slower):
```bash
npm run test:integration -- --testPathPattern=all-tools --runInBand
```

### Skip rate limit delays (will likely fail):
Not recommended, but you can modify `API_CALL_DELAY` in the test files.

## Test Structure

Each test:
1. Creates a mock vault with test files
2. Initializes a GeminiClient with all tools enabled
3. Sends a message that triggers the tool
4. Verifies the tool was called correctly
5. Checks the AI's response includes expected content
6. Waits 7 seconds before next test (rate limiting)

## What's Tested

### File Tools
- ✅ Reading single files
- ✅ Listing files in vault
- ✅ Reading multiple files with glob patterns
- ✅ Writing/creating new files

### Web Tools
- ✅ Fetching content from URLs
- ✅ Google web search with grounded results

### Memory Tools
- ✅ Saving facts to persistent memory
- ✅ Memory persistence across reloads

### Permission System
- ✅ Always allow
- ✅ Never allow
- ✅ Ask each time (with auto-approval in tests)
- ✅ Mixed permissions

## Expected Results

All tests should pass with real API calls. Example output:

```
✅ Tool 1: read_file - should read a specific file (1928 ms)
✅ Tool 2: list_files - should list all files in vault (1536 ms)
✅ Tool 3: read_many_files - should read multiple files at once (1263 ms)
...
```

## Troubleshooting

### Rate Limit Errors (429)
If you see "quota exceeded" errors:
- Wait 1 minute before running tests again
- Run tests one at a time
- Increase `API_CALL_DELAY` in the test file

### API Key Issues
Ensure your API key is set:
```bash
export GEMINI_API_KEY="your-key-here"
```

### Network Timeouts
Some tests have 30-60 second timeouts. If tests fail:
- Check your internet connection
- Verify Gemini API is accessible
- Check if your API key has quota remaining

## Continuous Integration

For CI/CD:
- Set `SKIP_INTEGRATION_TESTS=true` to skip these tests
- Or run them only on certain branches/schedules
- Consider using a paid API key for higher rate limits

## Adding New Tests

When adding tests for new tools:
1. Add the tool declaration to `gemini-client.ts`
2. Add a test case in `all-tools.integration.test.ts`
3. Follow the existing test pattern
4. Ensure you're checking for the correct tool call
5. Verify the AI's response makes sense

## Test Coverage

Current coverage of tools:
- ✅ read_file (100%)
- ✅ list_files (100%)
- ✅ read_many_files (100%)
- ✅ write_file (100%)
- ✅ web_fetch (100%)
- ✅ google_web_search (100%)
- ✅ save_memory (100%)

All 7 tools have dedicated test coverage!


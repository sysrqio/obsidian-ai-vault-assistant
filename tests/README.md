# Gemini Assistant Tests

Automated test suite for the Gemini Assistant plugin backend functionality.

## Overview

These tests cover core functionality that doesn't require UI interaction:

- **Memory Manager** - Long-term memory storage and retrieval
- **Vault Adapter** - File operations (read/write/list)
- **Model Selection** - Model fallback logic
- **Settings** - Configuration validation

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Watch Mode (Re-run on Changes)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

This generates a coverage report in the `coverage/` directory.

## Test Structure

```
tests/
├── setup.ts                    # Test utilities and mocks
├── memory-manager.test.ts      # Memory system tests
├── vault-adapter.test.ts       # File operations tests
├── model-selection.test.ts     # Model fallback tests
└── settings.test.ts            # Settings validation tests
```

## Writing New Tests

### Example Test

```typescript
import { MemoryManager } from '../src/memory-manager';

describe('MyFeature', () => {
    let feature: MyFeature;

    beforeEach(() => {
        feature = new MyFeature();
    });

    afterEach(() => {
        // Cleanup
    });

    test('should do something', async () => {
        const result = await feature.doSomething();
        expect(result).toBe('expected');
    });
});
```

### Test Patterns

1. **Arrange** - Set up test data and mocks
2. **Act** - Execute the code being tested
3. **Assert** - Verify the results

## Coverage Goals

Target coverage levels:
- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

## CI/CD Integration

Tests should be run as part of the CI/CD pipeline before deployment:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm test
  
- name: Check coverage
  run: npm run test:coverage
```

## What's Not Tested

These require manual testing or UI integration tests:
- React components (chat interface, modals)
- Obsidian API integration (actual vault operations)
- Gemini API calls (requires API key and network)
- OAuth flow (requires browser interaction)

## Troubleshooting

### Tests Failing

1. **Check dependencies**: `npm install`
2. **Check TypeScript**: `npm run build`
3. **Check file paths**: Ensure relative imports are correct
4. **Check mocks**: Verify mock data matches expected format

### Coverage Issues

- Add more test cases for edge cases
- Test error handling paths
- Test boundary conditions
- Test async operations

## Future Test Additions

- [ ] Tool execution tests (with mocked API)
- [ ] OAuth handler tests (with mocked requests)
- [ ] System prompt generation tests
- [ ] Error handling tests
- [ ] Integration tests (when possible)

## Test Philosophy

- **Fast**: Tests should run quickly
- **Isolated**: Each test should be independent
- **Deterministic**: Same input = same output
- **Readable**: Tests are documentation
- **Maintainable**: Easy to update as code changes

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [ts-jest](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)


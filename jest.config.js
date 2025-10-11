module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	testMatch: ['**/*.test.ts'],
	transform: {
		'^.+\\.tsx?$': ['ts-jest', {
			tsconfig: {
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
				resolveJsonModule: true,
				skipLibCheck: true
			}
		}]
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
	moduleNameMapper: {
		'^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts'
	},
	collectCoverageFrom: [
		'src/**/*.{ts,tsx}',
		'!src/**/*.d.ts',
		'!src/main.tsx',
		'!src/ui/**'
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	verbose: true,
	testTimeout: 10000,
	// Increase timeout for integration tests
	testPathIgnorePatterns: ['/node_modules/'],
	// Set environment variables for tests
	setupFiles: ['<rootDir>/tests/setup-env.js']
};


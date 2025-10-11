/**
 * Tests for model selection utilities
 */

import { getEffectiveModel, getFallbackModel } from '../src/utils/model-selection';

describe('Model Selection', () => {
	describe('getEffectiveModel', () => {
		test('should return flash when fallback mode is enabled', () => {
			const result = getEffectiveModel(true, 'gemini-2.5-pro');
			expect(result).toBe('gemini-2.5-flash');
		});

		test('should return requested model when fallback mode is disabled', () => {
			const result = getEffectiveModel(false, 'gemini-2.5-pro');
			expect(result).toBe('gemini-2.5-pro');
		});

		test('should handle flash model with fallback enabled', () => {
			const result = getEffectiveModel(true, 'gemini-2.5-flash');
			expect(result).toBe('gemini-2.5-flash');
		});

		test('should handle flash-lite model with fallback enabled', () => {
			const result = getEffectiveModel(true, 'gemini-2.5-flash-lite');
			expect(result).toBe('gemini-2.5-flash');
		});

		test('should handle 1.5 pro model', () => {
			const result = getEffectiveModel(false, 'gemini-1.5-pro');
			expect(result).toBe('gemini-1.5-pro');
		});

		test('should handle 1.5 flash model', () => {
			const result = getEffectiveModel(false, 'gemini-1.5-flash');
			expect(result).toBe('gemini-1.5-flash');
		});
	});

	describe('getFallbackModel', () => {
		test('should fallback from pro to flash', () => {
			const result = getFallbackModel('gemini-2.5-pro');
			expect(result).toBe('gemini-2.5-flash');
		});

		test('should fallback from flash to flash-lite', () => {
			const result = getFallbackModel('gemini-2.5-flash');
			expect(result).toBe('gemini-2.5-flash-lite');
		});

		test('should return same model when already at lowest tier', () => {
			const result = getFallbackModel('gemini-2.5-flash-lite');
			expect(result).toBe('gemini-2.5-flash-lite');
		});

		test('should handle model names without pro/flash', () => {
			const result = getFallbackModel('gemini-1.5-turbo');
			expect(result).toBe('gemini-1.5-turbo');
		});

		test('should handle 1.5-pro fallback', () => {
			const result = getFallbackModel('gemini-1.5-pro');
			expect(result).toBe('gemini-2.5-flash');
		});

		test('should handle 1.5-flash fallback', () => {
			const result = getFallbackModel('gemini-1.5-flash');
			expect(result).toBe('gemini-2.5-flash-lite');
		});
	});
});


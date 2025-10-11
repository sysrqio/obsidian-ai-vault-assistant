/**
 * Model selection utilities following gemini-cli pattern
 */

/**
 * Get effective model based on fallback mode
 * Following gemini-cli's model selection logic
 */
export function getEffectiveModel(fallbackMode: boolean, requestedModel: string): string {
	if (fallbackMode) {
		// When fallback is enabled, always use Flash
		console.log(`[Model] Fallback mode enabled, using gemini-2.5-flash instead of ${requestedModel}`);
		return 'gemini-2.5-flash';
	}
	
	return requestedModel;
}

/**
 * Get fallback model for rate limiting scenarios
 * Pro → Flash → Flash Lite
 */
export function getFallbackModel(model: string): string {
	if (model.includes('pro')) {
		return 'gemini-2.5-flash';
	}
	
	if (model.includes('flash') && !model.includes('lite')) {
		return 'gemini-2.5-flash-lite';
	}
	
	// Already at lowest tier
	return model;
}

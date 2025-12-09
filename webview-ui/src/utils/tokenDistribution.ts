export interface TokenDistributionResult {
	currentPercent: number;
	reservedPercent: number;
	availablePercent: number;
	availableSize: number;
}

export const calculateTokenDistribution = (
	currentContextTokens: number,
	availableInputSize: number,
	contextWindow: number,
	maxOutputTokens: number
): TokenDistributionResult => {
	const safeContextTokens = Math.max(0, currentContextTokens);
	const safeAvailableSize = Math.max(0, availableInputSize);
	const safeMaxOutputTokens = Math.max(0, maxOutputTokens);
	const total = contextWindow;

	if (total <= 0) {
		return { currentPercent: 0, reservedPercent: 0, availablePercent: 0, availableSize: 0 };
	}

	return {
		currentPercent: (safeContextTokens / total) * 100,
		reservedPercent: (safeMaxOutputTokens / total) * 100,
		availablePercent: (safeAvailableSize / total) * 100,
		availableSize: safeAvailableSize,
	};
};

import React, { useMemo } from "react";
import { calculateTokenDistribution } from "../../utils/tokenDistribution";
import { formatLargeNumber } from "../../utils/formatters";

interface ContextWindowProgressProps {
	currentContextTokens: number; // Latest prompt_tokens
	availableInputSize: number; // Available size for input
	contextWindow: number; // Total context window
	maxOutputTokens: number; // Reserved for output
}

export const ContextWindowProgress: React.FC<ContextWindowProgressProps> = ({
	currentContextTokens,
	availableInputSize,
	contextWindow,
	maxOutputTokens,
}) => {
	const distribution = useMemo(
		() => calculateTokenDistribution(currentContextTokens, availableInputSize, contextWindow, maxOutputTokens),
		[currentContextTokens, availableInputSize, contextWindow, maxOutputTokens]
	);

	// Calculate warning thresholds from Rework.md
	const criticalThreshold = availableInputSize * 0.95; // 95%
	const warningThreshold = availableInputSize * 0.8; // 80%

	const getWarningClass = () => {
		if (currentContextTokens >= criticalThreshold) return "critical";
		if (currentContextTokens >= warningThreshold) return "warning";
		return "";
	};

	return (
		<div className={`context-progress ${getWarningClass()}`} role="region" aria-label="Context window usage">
			<span className="token-count" aria-label={`Current context usage: ${currentContextTokens} tokens`}>
				{formatLargeNumber(currentContextTokens)}
			</span>
			<div
				className="progress-bar"
				role="progressbar"
				aria-valuenow={distribution.currentPercent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Context window usage percentage"
			>
				<div
					className="used"
					style={{ width: `${distribution.currentPercent}%` }}
					aria-label="Used context tokens"
					aria-hidden="true"
				/>
				<div
					className="reserved"
					style={{ width: `${distribution.reservedPercent}%` }}
					aria-label="Reserved output tokens"
					aria-hidden="true"
				/>
			</div>
			<span className="max-tokens" aria-label={`Total context window: ${contextWindow} tokens`}>
				{formatLargeNumber(contextWindow)}
			</span>
		</div>
	);
};

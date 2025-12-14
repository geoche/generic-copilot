import React from "react";
import { formatLargeNumber } from "../../utils/formatters";

interface TokenCountersProps {
	sessionInputTokens: number; // Sum of all prompt_tokens
	sessionOutputTokens: number; // Sum of all completion_tokens
}

export const TokenCounters: React.FC<TokenCountersProps> = ({ sessionInputTokens, sessionOutputTokens }) => (
	<div className="token-counters" role="region" aria-label="Session token counters">
		<span className="tokens-label">Session Tokens</span>
		<span className="tokens-in" aria-label={`Total session input tokens: ${formatLargeNumber(sessionInputTokens)}`}>
			<span className="arrow" aria-hidden="true">
				↑
			</span>{" "}
			{formatLargeNumber(sessionInputTokens)}
		</span>
		<span className="tokens-out" aria-label={`Total session output tokens: ${formatLargeNumber(sessionOutputTokens)}`}>
			<span className="arrow" aria-hidden="true">
				↓
			</span>{" "}
			{formatLargeNumber(sessionOutputTokens)}
		</span>
	</div>
);

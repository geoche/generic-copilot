import React from "react";
import { ContextWindowProgress } from "./ContextWindowProgress";
import { TokenCounters } from "./TokenCounters";
import { SessionTimeline } from "./SessionTimeline";
import { ContextBannerProps } from "./types";

export const ContextBanner: React.FC<ContextBannerProps> = ({ metrics, timeline, isActive, onTimelineClick }) => {
	return (
		<div className="context-banner">
			{timeline.length > 0 && (
				<SessionTimeline messages={timeline} isActive={isActive} onMessageClick={onTimelineClick} />
			)}
			<ContextWindowProgress
				currentContextTokens={metrics.currentContextTokens}
				availableInputSize={metrics.availableInputSize}
				contextWindow={metrics.contextWindow}
				maxOutputTokens={metrics.maxOutputTokens}
			/>
			<TokenCounters
				sessionInputTokens={metrics.sessionInputTokens}
				sessionOutputTokens={metrics.sessionOutputTokens}
			/>
		</div>
	);
};

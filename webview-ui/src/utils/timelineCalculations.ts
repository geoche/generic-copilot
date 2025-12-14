import { TimelineMessage } from "../components/context-banner/types";

export interface TimelineBarSize {
	heightPercent: number;
	width: number;
}

/**
 * Calculate timeline bar sizes based on message content and timing
 */
export const calculateTimelineSizes = (messages: TimelineMessage[]): TimelineBarSize[] => {
	if (!messages || messages.length === 0) return [];

	// Calculate content length baseline
	const contentLengths = messages.map((msg) => msg.contentLength);
	const minContent = Math.min(...contentLengths);
	const maxContent = Math.max(...contentLengths);

	// Calculate time span for relative timing
	const timestamps = messages.map((msg) => msg.timestamp);
	const minTime = Math.min(...timestamps);
	const maxTime = Math.max(...timestamps);
	const timeSpan = Math.max(1, maxTime - minTime); // Avoid division by zero

	return messages.map((msg) => {
		// Content-based height (0.3 to 1.0 scale)
		const contentRange = maxContent - minContent;
		const contentNormalized = contentRange > 0 ? (msg.contentLength - minContent) / contentRange : 0.5;
		const heightPercent = 30 + contentNormalized * 70; // 30% to 100%

		// Time-based width (8px to 32px scale)
		const timeNormalized = (msg.timestamp - minTime) / timeSpan;
		const width = 8 + timeNormalized * 24; // 8px to 32px

		return { heightPercent, width };
	});
};

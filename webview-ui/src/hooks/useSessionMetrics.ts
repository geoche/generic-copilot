import { useMemo } from "react";
import { SessionMetrics, TimelineMessage, LogMessage } from "../types";

/**
 * Hook to derive session metrics and timeline from existing logs
 * Uses actual API usage data (prompt_tokens, completion_tokens) from API responses
 */
export const useSessionMetrics = (logs: LogMessage[]): { metrics: SessionMetrics; timeline: TimelineMessage[] } => {
	return useMemo(() => {
		let sessionInputTokens = 0;
		let sessionOutputTokens = 0;
		let contextWindow = 128000; // Default fallback
		let maxOutputTokens = 8000; // Default fallback

		// Extract model configuration for context window
		for (const log of logs) {
			if (log.request?.modelContextLength && log.request.modelContextLength > 0) {
				contextWindow = log.request.modelContextLength;
				maxOutputTokens = 8000; // From provideModel.ts DEFAULT_MAX_TOKENS
				break;
			}
		}

		// Available input size = context window - max output tokens
		const availableInputSize = Math.max(0, contextWindow - maxOutputTokens);

		const timelineMessages: TimelineMessage[] = [];

		// Find the latest log with usage data for current context
		let latestLog: LogMessage | null = null;
		let latestTimestamp = 0;

		// First pass: find the chronologically latest log with usage data
		for (const log of logs) {
			const logTimestamp = extractTimestamp(log.request?.timestamp) || 0;
			if (log.request?.usage?.prompt_tokens !== undefined && logTimestamp > latestTimestamp) {
				latestLog = log;
				latestTimestamp = logTimestamp;
			}
		}

		// Second pass: accumulate session totals
		for (const log of logs) {
			// Extract actual prompt_tokens from request usage data
			if (log.request?.usage?.prompt_tokens !== undefined) {
				const promptTokens = log.request.usage.prompt_tokens;
				sessionInputTokens += promptTokens;
			}

			// Extract actual completion_tokens from response usage data
			if (log.response?.usage?.completion_tokens !== undefined) {
				const completionTokens = log.response.usage.completion_tokens;
				sessionOutputTokens += completionTokens;
				console.log('[DEBUG] Found completion tokens:', completionTokens, 'from log:', log.id, 'Total output now:', sessionOutputTokens);
			} else {
				console.log('[DEBUG] No completion tokens in log:', log.id, 'Response usage:', log.response?.usage);
			}

			// Create timeline (unchanged - just for visualization)
			if (log.request) {
				const requestTimestamp = extractTimestamp(log.request.timestamp) || Date.now();
				timelineMessages.push({
					id: `${log.id}-request`,
					timestamp: requestTimestamp,
					type: "user",
					contentLength: calculateContentLength(log.request),
				});
			}

			if (log.response) {
				const responseTimestamp = extractTimestamp(log.response.timestamp) || Date.now();
				timelineMessages.push({
					id: `${log.id}-response`,
					timestamp: responseTimestamp,
					type: "assistant",
					contentLength: calculateContentLength(log.response),
				});
			}
		}

		// Sort timeline by timestamp
		timelineMessages.sort((a, b) => a.timestamp - b.timestamp);

		// Get current context from the latest log
		const currentContextTokens = latestLog?.request?.usage?.prompt_tokens || 0;

		const metrics: SessionMetrics = {
			// Usage-based metrics
			currentContextTokens, // Latest prompt_tokens only
			sessionInputTokens, // Sum of all prompt_tokens
			sessionOutputTokens, // Sum of all completion_tokens
			availableInputSize, // contextWindow - maxOutputTokens
			contextWindow, // Total context window from model config
			maxOutputTokens, // Reserved for output
		};

		return { metrics, timeline: timelineMessages };
	}, [logs]);
};

/**
 * Extract timestamp from various possible formats
 */
const extractTimestamp = (timestamp: any): number | undefined => {
	if (!timestamp) return undefined;

	if (typeof timestamp === "number") {
		return timestamp;
	}

	if (typeof timestamp === "string") {
		const parsed = Date.parse(timestamp);
		return isNaN(parsed) ? undefined : parsed;
	}

	if (timestamp instanceof Date) {
		return timestamp.getTime();
	}

	return undefined;
};

/**
 * Calculate content length for timeline visualization
 */
const calculateContentLength = (obj: any): number => {
	if (!obj) return 0;

	// Try different possible content fields
	const content = obj.content || obj.text || obj.message || obj.body || "";

	if (typeof content === "string") {
		return content.length;
	}

	if (Array.isArray(content)) {
		return content.reduce((sum, item) => {
			if (typeof item === "string") return sum + item.length;
			if (typeof item === "object" && item.text) return sum + item.text.length;
			return sum;
		}, 0);
	}

	if (typeof content === "object") {
		return JSON.stringify(content).length;
	}

	return 0;
};

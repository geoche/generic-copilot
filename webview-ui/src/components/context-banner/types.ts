export interface SessionMetrics {
	currentContextTokens: number; // Latest prompt_tokens (from most recent request)
	sessionInputTokens: number; // Sum of all prompt_tokens across session
	sessionOutputTokens: number; // Sum of all completion_tokens across session
	availableInputSize: number; // MODEL_CONTEXT_SIZE - MAX_OUTPUT_SIZE
	contextWindow: number; // Total context window (from model config)
	maxOutputTokens: number; // Reserved output tokens
}

export interface TimelineMessage {
	id: string;
	timestamp: number;
	type: "user" | "assistant" | "system" | "tool";
	contentLength: number;
}

export interface ContextBannerProps {
	metrics: SessionMetrics;
	timeline: TimelineMessage[];
	isActive?: boolean;
	onTimelineClick?: (messageId: string) => void;
}

export interface SessionTimelineProps {
	messages: TimelineMessage[];
	isActive?: boolean;
	onMessageClick?: (id: string) => void;
}

export interface TokenDistributionResult {
	currentPercent: number;
	availablePercent: number;
	availableSize: number;
}

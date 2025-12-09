/*
 * TOKEN ESTIMATION MODULE
 *
 * This module provides estimation methods for real-time token counting during API calls.
 *
 * IMPORTANT: These are APPROXIMATE calculations that provide immediate feedback while
 * actual API usage data is being received from API responses.
 *
 * CURRENT USAGE:
 * - Status bar uses these estimations for real-time token counting during streaming
 * - Context banner uses actual API response data (prompt_tokens, completion_tokens, total_tokens)
 * - Provider client uses these as fallback when API usage data is unavailable
 *
 * WORKFLOW:
 * 1. During API call: Status bar shows estimated tokens for immediate feedback
 * 2. After API response: Context banner updates with actual usage data from API
 * 3. Provider client: Uses real API usage when available, falls back to estimation
 *
 * The estimation uses tiktoken for accurate tokenization based on model specifications.
 */

import * as vscode from "vscode";
import { CancellationToken, LanguageModelChatInformation, LanguageModelChatRequestMessage } from "vscode";
import { get_encoding } from "tiktoken";

/**
 * Returns the estimated number of tokens for a given text using the model specific tokenizer logic
 *
 * This provides APPROXIMATE token counts for immediate feedback during API calls.
 * Actual usage data is provided by API responses (prompt_tokens, completion_tokens, total_tokens).
 *
 * CURRENT USAGE:
 * - Status bar uses this for real-time token counting during streaming
 * - Provider client uses as fallback when API usage data unavailable
 *
 * @param model The language model to use
 * @param text The text to count tokens for
 * @param token A cancellation token for the request
 * @returns A promise that resolves to the estimated number of tokens
 * @note This is an estimation for real-time feedback. Use actual API usage data for final calculations.
 */

export async function prepareTokenCount(
	_model: LanguageModelChatInformation,
	text: LanguageModelChatRequestMessage,
	_token: CancellationToken
): Promise<number> {
	// For complex messages, calculate tokens for each part separately
	let totalTokens = 0;

	for (const part of text.content) {
		if (part instanceof vscode.LanguageModelTextPart) {
			// Estimate tokens directly for plain text
			totalTokens += estimateTextTokens(part.value);
		} else if (part instanceof vscode.LanguageModelToolCallPart) {
			// Tool call token calculation
			totalTokens += estimateToolTokens(part);
		} else if (part instanceof vscode.LanguageModelToolResultPart) {
			// Tool result token calculation
			const resultText = typeof part.content === "string" ? part.content : JSON.stringify(part.content);
			totalTokens += estimateTextTokens(resultText);
		}
	}
	// Apply correction factor based on empirical observations
	totalTokens = Math.ceil(totalTokens * 1.0166);
	return totalTokens;
}

/**
 * Estimates token count for VS Code chat messages using accurate tiktoken encoding
 *
 * This is used by the status bar for real-time token counting during API calls.
 * For final usage data, use the actual API response data (prompt_tokens, completion_tokens).
 *
 * @param msgs The messages to estimate token count for
 * @returns The estimated token count (approximate)
 * @note Use actual API usage data when available for precise calculations
 */
export function estimateMessagesTokens(msgs: readonly vscode.LanguageModelChatRequestMessage[]): number {
	const enc = get_encoding("o200k_base");
	let total = 0;
	for (const m of msgs) {
		for (const part of m.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				total += enc.encode_ordinary(part.value).length;
			}
		}
	}
	enc.free();
	return total;
}

/**
 * Estimates token count for text content using tiktoken encoding
 *
 * Used for approximate token calculations when actual API usage data is not available.
 *
 * @param text The text to estimate token count for
 * @returns The estimated token count
 * @note This is an approximation. Use actual API usage data when available.
 */
export function estimateTextTokens(text: string): number {
	const enc = get_encoding("o200k_base");
	const len = enc.encode_ordinary(text).length;
	enc.free();
	return len;
}

/**
 * Estimates token count for tool calls based on JSON size and metadata
 *
 * Used for approximate token calculation when actual API usage data is not available.
 *
 * @param toolCall The tool call to estimate token count for
 * @returns The estimated token count
 * @note This is an approximation. Use actual API usage data when available.
 */
export function estimateToolTokens(toolCall: vscode.LanguageModelToolCallPart): number {
	const enc = get_encoding("o200k_base");
	let total = 0;
	total += enc.encode_ordinary(toolCall.name).length;
	total += enc.encode_ordinary(JSON.stringify(toolCall.input)).length;
	total += enc.encode_ordinary(JSON.stringify(toolCall.callId)).length;
	enc.free();
	return total;
}

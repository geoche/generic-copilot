import {
	Progress,
	LanguageModelChatRequestMessage,
	LanguageModelTextPart,
	LanguageModelThinkingPart, //part of proposed api
	LanguageModelToolCallPart,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart, //part of proposed api
	CancellationToken,
} from "vscode";
import { z } from "zod";
import * as vscode from "vscode";

import { generateText, JSONValue, streamText } from "ai";
import { ModelItem, ProviderConfig, VercelType } from "../types";
import { LM2VercelMessage, LM2VercelTool, normalizeToolInputs } from "./utils/conversion";
import { ModelMessage, LanguageModel, Provider, ProviderMetadata } from "ai";
import { MessageLogger, LoggedRequest, LoggedResponse, LoggedInteraction, ApiUsageData } from "./utils/messageLogger";
import { logger } from "../outputLogger";
import {
	generateCompletionPromptInstruction,
	completionSystemInstruction,
	completionDescription,
} from "../autocomplete/constants";
import { estimateMessagesTokens } from "../provideToken";

/**
 * Abstract base class for provider clients that interact with language model providers.
 * Handles configuration, provider instance management, and message conversion.
 */
export abstract class ProviderClient {
	//The type of the provider (e.g., OpenAI, Vercel, etc.).
	public type: VercelType;

	// Configuration for the provider client.

	protected config: ProviderConfig;

	// The underlying provider instance used for API calls.
	protected providerInstance: Provider;

	/**
	 * Constructs a new ProviderClient.
	 * @param type The type of provider.
	 * @param config The provider configuration.
	 * @param providerInstance The provider instance.
	 */
	protected constructor(type: VercelType, config: ProviderConfig, providerInstance: Provider) {
		this.type = type;
		this.config = config;
		this.providerInstance = providerInstance;
		logger.debug(`ProviderClient created for type "${type}" with config ID "${config.id}"`);
	}

	/**
	 * Generates a streaming response from the language model.
	 * @param request The chat request messages.
	 * @param options Options for providing the chat response.
	 * @param config The model item configuration.
	 * @param progress Progress callback for streaming response parts.
	 */
	async generateStreamingResponse(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		progress: Progress<LanguageModelResponsePart>,
		providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<void> {
		const languageModel = this.getLanguageModel(config.slug);
		const messages = this.convertMessages(request);
		const tools = this.convertTools(options);
		const messageLogger = MessageLogger.getInstance();
		// Estimate input tokens as fallback (will be updated with real usage data if available)
		const estimatedInputTokens = await estimateMessagesTokens(request);

		logger.debug(`Generating streaming response for model "${config.id}" with provider "${this.config.id}"`);
		//Log the incoming request as soon as possible.
		const interactionId = messageLogger.addRequestResponse({
			type: "request",
			vscodeMessages: request,
			vscodeOptions: options,
			vercelMessages: messages,
			vercelTools: tools,
			modelConfig: config,
			// Fallback estimation - will be updated with real usage if available
			usage: {
				prompt_tokens: estimatedInputTokens,
				completion_tokens: 0,
				total_tokens: estimatedInputTokens,
			},
		});

		let lastError: any;
		const maxRetries = config.retries ?? 3;
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				logger.debug(`Streaming response started for model "${config.id}" with provider "${this.config.id}"`);
				let streamError: any;

				// Record start time for performance measurement
				const startTime = Date.now();

				const responseLog: LoggedResponse = {
					type: "response",
					textParts: [],
					thinkingParts: [],
					toolCallParts: [],
				};
				logger.debug(`Processing streaming response parts for model "${config.id}" with provider "${this.config.id}"`);
				const result = streamText({
					model: languageModel,
					messages: messages,
					tools: tools,
					maxRetries: 3,
					providerOptions: providerOptions || {},
					onError: ({ error }) => {
						logger.error(`Error during streaming response: ${error instanceof Error ? error.message : String(error)}`);
						streamError = error;
					}
				});

				// We need to handle fullStream to get tool calls
				for await (const part of result.fullStream) {
					if (part.type === "reasoning-delta") {
						const thinkingPart = new LanguageModelThinkingPart(part.text, part.id);
						responseLog.thinkingParts?.push(thinkingPart);
						progress.report(thinkingPart);
					} else if (part.type === "text-delta") {
						const textPart = new LanguageModelTextPart(part.text);
						responseLog.textParts?.push(textPart);
						progress.report(new LanguageModelTextPart(part.text));
					} else if (part.type === "tool-call") {
						const normalizedInput = normalizeToolInputs(part.toolName, part.input);
						const toolCall = new LanguageModelToolCallPart(part.toolCallId, part.toolName, normalizedInput as object);

						// Allow subclasses to process tool call metadata.
						// Only called by subclasses that implement it (e.g., GoogleProviderClient).
						this.processToolCallMetadata(part.toolCallId, part.providerMetadata);

						responseLog.toolCallParts?.push(toolCall);
						progress.report(toolCall);
					}
				}
				if (streamError) {
					throw streamError;
				}

				// Allow subclasses to process response-level metadata (e.g., OpenAI's responseId)
				this.processResponseMetadata(result);

				// Add usage information after streaming completes
				const vercelUsage = await result.usage;

				// [DEBUG] Log raw API response to see what the API actually returns
				logger.debug(`[API Usage] Model: ${config.id}, Request ID: ${interactionId}`);
				logger.debug(`[API Response] Full result object keys: ${JSON.stringify(Object.keys(result))}`);
				
				// Try to access rawResponse if it exists
				if ((result as any).rawResponse) {
					logger.debug(`[API Response] Raw response exists`);
					try {
						const rawResp = (result as any).rawResponse;
						logger.debug(`[API Response] Raw response keys: ${JSON.stringify(Object.keys(rawResp))}`);
						logger.debug(`[API Response] Raw response: ${JSON.stringify(rawResp)}`);
					} catch (e) {
						logger.debug(`[API Response] Could not stringify raw response: ${e}`);
					}
				}
				
				// Log the experimental_providerMetadata if it exists
				if ((result as any).experimental_providerMetadata) {
					logger.debug(`[API Response] Provider metadata: ${JSON.stringify((result as any).experimental_providerMetadata)}`);
				}
				
				// Log response metadata if it exists
				if ((result as any).response) {
					logger.debug(`[API Response] Response object: ${JSON.stringify((result as any).response)}`);
				}
				
				logger.debug(`[API Usage] Raw vercelUsage object: ${JSON.stringify(vercelUsage)}`);

				// Convert Vercel AI SDK usage to our ApiUsageData format
				if (vercelUsage) {
					responseLog.usage = {
						prompt_tokens: vercelUsage.inputTokens ?? 0,
						completion_tokens: vercelUsage.outputTokens ?? 0,
						total_tokens: vercelUsage.totalTokens ?? 0,
					};

					// [DEBUG] Log API usage data
					logger.debug(`[API Usage] Input Tokens: ${vercelUsage.inputTokens ?? 0}`);
					logger.debug(`[API Usage] Output Tokens: ${vercelUsage.outputTokens ?? 0}`);
					logger.debug(`[API Usage] Total Tokens: ${vercelUsage.totalTokens ?? 0}`);
					logger.debug(`[API Usage] Response usage: ${JSON.stringify(responseLog.usage)}`);

					// Update the request's usage with actual values from the API response
					// This replaces the estimated tokens with actual usage data
					const existingLog = messageLogger.get().find(log => log.id === interactionId);
					if (existingLog?.request) {
						existingLog.request.usage = {
							prompt_tokens: vercelUsage.inputTokens ?? estimatedInputTokens,
							completion_tokens: 0, // Request doesn't have completion tokens
							total_tokens: vercelUsage.inputTokens ?? estimatedInputTokens,
						};
						logger.debug(`[API Usage] Updated request usage: ${JSON.stringify(existingLog.request.usage)}`);
					}
				}

				// Calculate total text content length for display purposes
				const totalTextLength = responseLog.textParts?.reduce((sum, part) => sum + part.value.length, 0) || 0;
				responseLog.textContentLength = totalTextLength;

				messageLogger.addRequestResponse(responseLog, interactionId);
				return;
			} catch (error) {
				progress.report(
					new LanguageModelThinkingPart("\n\n[Error occurred during streaming response.  Retrying...]\n", "error")
				);
				lastError = error;
				logger.warn(
					`Chat request failed (attempt ${attempt + 1}): ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
		logger.error("Chat request failed after retries:", (lastError as Error).message);
		vscode.window.showErrorMessage(
			`Chat request failed after multiple attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
		);
	}

	async getInlineCompleteResponse(
		config: ModelItem,
		prefix: string,
		suffix: string,
		fileName: string,
		languageId: string,
		token: CancellationToken
	): Promise<string> {
		const languageModel = this.getLanguageModel(config.slug);

		const result = await generateText({
			model: languageModel,
			system: completionSystemInstruction,
			// Construct the prompt using the inputs
			prompt: generateCompletionPromptInstruction(fileName, languageId, prefix, suffix),
		});
		return result.text;
	}

	/**
	 * Retrieves a language model by its slug identifier from the provider instance.
	 * @param slug The model slug identifier.
	 * @returns The language model instance.
	 */
	getLanguageModel(slug: string): LanguageModel {
		return this.providerInstance.languageModel(slug);
	}
	/**
	 * Converts VS Code chat request messages to the provider's model message format.
	 * @param messages Array of VS Code chat request messages.
	 * @returns Array of converted model messages.
	 */
	convertMessages(messages: readonly LanguageModelChatRequestMessage[]): ModelMessage[] {
		return LM2VercelMessage(messages);
	}
	/**
	 * Converts VS Code chat request messages to the provider's model message format.
	 * @param messages Array of VS Code chat request messages.
	 * @returns Array of converted model messages.
	 */
	convertTools(options: ProvideLanguageModelChatResponseOptions): Record<string, any> | undefined {
		return LM2VercelTool(options);
	}

	/**
	 * Hook for subclasses to process tool call metadata from the provider.
	 * Override this method to handle provider-specific metadata (e.g., Google's thoughtSignature).
	 * @param toolCallId The ID of the tool call.
	 * @param providerMetadata The metadata from the provider, if any.
	 */
	protected processToolCallMetadata(toolCallId: string, providerMetadata: ProviderMetadata | undefined): void {
		// Default implementation does nothing.
		// Subclasses like GoogleProviderClient can override to cache metadata.
	}

	/**
	 * Hook for subclasses to process response-level metadata from the provider.
	 * Override this method to handle provider-specific response metadata (e.g., OpenAI's responseId).
	 * @param result The streaming result object from streamText.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected processResponseMetadata(result: any): void {
		// Default implementation does nothing.
		// Subclasses like OpenAIProviderClient can override to cache response metadata.
	}
}

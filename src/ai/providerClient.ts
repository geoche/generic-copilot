import {
	Progress,
	LanguageModelChatRequestMessage,
	LanguageModelTextPart,
	LanguageModelThinkingPart,
	LanguageModelToolCallPart,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart,
} from "vscode";

import { streamText } from "ai";
import { ModelItem, ProviderConfig, VercelType } from "../types";
import { LM2VercelMessage, LM2VercelTool, normalizeToolInputs } from "./utils/conversion";
import { ModelMessage, LanguageModel, Provider } from "ai";
import { MessageLogger, LoggedRequest, LoggedResponse, LoggedInteraction } from "./utils/messageLogger";
import { ApiUsageData } from "./utils/messageLogger";
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
		progress: Progress<LanguageModelResponsePart>
	): Promise<void> {
		const languageModel = this.getLanguageModel(config.slug);
		const messages = this.convertMessages(request);
		const tools = this.convertTools(options);
		const messageLogger = MessageLogger.getInstance();

		// Estimate input tokens as fallback (will be updated with real usage data if available)
		const estimatedInputTokens = estimateMessagesTokens(request);

		// Log the request
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
		} as LoggedRequest);

		try {
			const result = await streamText({
				model: languageModel,
				messages: messages,
				tools: tools,
			});

			const responseLog: LoggedResponse = {
				type: "response",
				textParts: [],
				thinkingParts: [],
				toolCallParts: [],
				textContentLength: 0,
			};

			let totalContentLength = 0;

			// Process streaming response
			for await (const part of result.fullStream) {
				if (part.type === "reasoning-delta") {
					const thinkingPart = new LanguageModelThinkingPart(part.text);
					responseLog.thinkingParts?.push(thinkingPart);
					totalContentLength += part.text.length;
					progress.report(thinkingPart);
				} else if (part.type === "text-delta") {
					const textPart = new LanguageModelTextPart(part.text);
					responseLog.textParts?.push(textPart);
					totalContentLength += part.text.length;
					progress.report(new LanguageModelTextPart(part.text));
				} else if (part.type === "tool-call") {
					const normalizedInput = normalizeToolInputs(part.toolName, part.input);
					const toolCall = new LanguageModelToolCallPart(part.toolCallId, part.toolName, normalizedInput as object);
					responseLog.toolCallParts?.push(toolCall);
					totalContentLength += part.toolName.length + JSON.stringify(part.input).length;
					progress.report(toolCall);
				}
			}

			// Extract actual usage data from result
			let finalUsage: ApiUsageData = {
				prompt_tokens: estimatedInputTokens,
				completion_tokens: Math.ceil(totalContentLength / 4), // Fallback estimation
				total_tokens: estimatedInputTokens + Math.ceil(totalContentLength / 4),
			};

			// Try to get real usage data from AI SDK
			if (result.usage) {
				finalUsage = {
					prompt_tokens:
						(result.usage as any).promptTokens || (result.usage as any).prompt_tokens || estimatedInputTokens,
					completion_tokens:
						(result.usage as any).completionTokens ||
						(result.usage as any).completion_tokens ||
						Math.ceil(totalContentLength / 4),
					total_tokens:
						(result.usage as any).totalTokens || (result.usage as any).total_tokens || finalUsage.total_tokens,
				};
			}

			// Try to get usage from additional API calls if available
			// This is a placeholder for potential additional usage data sources
			if ((result as any).response) {
				const response = (result as any).response;
				if (response.usage) {
					finalUsage = {
						prompt_tokens: response.usage.prompt_tokens || finalUsage.prompt_tokens,
						completion_tokens: response.usage.completion_tokens || finalUsage.completion_tokens,
						total_tokens: response.usage.total_tokens || finalUsage.total_tokens,
					};
				}
			}

			responseLog.usage = finalUsage;
			responseLog.textContentLength = totalContentLength; // For display only

			// Update the request log with final usage data
			const requestLog = messageLogger.getById(interactionId)?.request;
			if (requestLog) {
				requestLog.usage = {
					prompt_tokens: finalUsage.prompt_tokens,
					completion_tokens: 0, // Request doesn't have completion tokens
					total_tokens: finalUsage.prompt_tokens,
				};
			}
			messageLogger.addRequestResponse(responseLog, interactionId);
		} catch (error) {
			console.error("Chat request failed:", error);
			throw error;
		}
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
}

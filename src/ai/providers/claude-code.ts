import { ProviderClient } from "../providerClient";
import { Provider, streamText, TextStreamPart, ToolSet } from "ai";
import {
	Progress,
	LanguageModelChatRequestMessage,
	LanguageModelTextPart,
	LanguageModelThinkingPart, //part of proposed api
	LanguageModelToolCallPart,
	LanguageModelToolResultPart2,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart2 as LanguageModelResponsePart, //part of proposed api
	CancellationToken,
} from "vscode";
import { ProviderConfig, ModelItem } from "../../types";
import * as vscode from "vscode";
import { JSONValue } from "ai";
import { logger } from "../../outputLogger";
import { LoggedRequest, LoggedResponse, MessageLogger, ApiUsageData } from "../utils/messageLogger";
import { normalizeToolInputs } from "../utils/conversion";

// Dynamic import for ESM module - using any type to avoid TS1479 error
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createClaudeCodeFn: any;
const loadClaudeCode = async () => {
	if (!createClaudeCodeFn) {
		const module = await import("ai-sdk-provider-claude-code");
		createClaudeCodeFn = module.createClaudeCode;
	}
	return createClaudeCodeFn;
};

export class ClaudeCodeProviderClient extends ProviderClient {
	private providerInitialized = false;

	constructor(config: ProviderConfig) {
		// Pass undefined initially, will be set lazily
		super("claude-code", config, undefined as unknown as Provider);
	}

	private async ensureProviderInitialized(): Promise<void> {
		if (this.providerInitialized) {
			return;
		}
		const createClaudeCode = await loadClaudeCode();
		const claudeSpecificOptions = this.config.providerSpecificOptions || {};
		const providerInstance = createClaudeCode({
			defaultSettings: {
				pathToClaudeCodeExecutable: claudeSpecificOptions.pathToClaudeCodeExecutable || null,
				permissionMode: claudeSpecificOptions.permissionMode || "bypassPermissions", // Ask for permissions
				systemPrompt: claudeSpecificOptions.systemPrompt || "",
				verbose: false,
				logger: {
					debug: (message: string) => {},
					info: (message: string) => logger.info(`Claude: ${message}`),
					warn: (message: string) => logger.warn(`Claude: ${message}`),
					error: (message: string) => logger.error(`Claude: ${message}`),
				},
			},
		});
		this.providerInstance = providerInstance;
		this.providerInitialized = true;
	}

	/**
	 * Provides Claude Code-specific streaming response implementation.
	 */
	async generateStreamingResponse(
		request: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		config: ModelItem,
		progress: Progress<LanguageModelResponsePart>,
		_providerOptions?: Record<string, Record<string, JSONValue>>
	): Promise<void> {
		await this.ensureProviderInitialized();
		const messages = this.convertMessages(request);
		//Log the incoming request as soon as possible.
		const messageLogger = MessageLogger.getInstance();
		const interactionId = messageLogger.addRequestResponse({
			type: "request",
			vscodeMessages: request,
			vscodeOptions: options,
			vercelMessages: messages,
			vercelTools: {},
			modelConfig: config,
			usage: {
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0,
			},
		} as LoggedRequest);
		let streamError: any;
		const result = streamText({
			model: this.providerInstance.languageModel(config.slug),
			messages: messages,
			maxRetries: 3,
			onError: ({ error }) => {
				logger.error(`Error during streaming response: ${error instanceof Error ? error.message : String(error)}`);
				streamError = error;
			},
		});
		const responseLog: LoggedResponse = {
			type: "response",
			textParts: [],
			thinkingParts: [],
			toolCallParts: [],
		};
		// Record start time for performance measurement
		const startTime = Date.now();

		// We need to handle fullStream to get tool calls
		for await (const part of result.fullStream) {
			if (part.type === "reasoning-delta") {
				const thinkingPart = new LanguageModelThinkingPart(`${part.text}`, part.id);
				responseLog.thinkingParts?.push(thinkingPart);
				progress.report(thinkingPart);
			} else if (part.type === "text-delta") {
				const textPart = new LanguageModelTextPart(`${part.text}`);
				responseLog.textParts?.push(textPart);
				progress.report(textPart);
			} else if (part.type === "tool-call") {
				progress.report(this.generateTextPartForToolCall(part));
			} else {
				//logger.warn(`Unknown part type received from Claude Code: ${part.type}: ${JSON.stringify(part)}`);
			}
		}
		if (streamError) {
			throw streamError;
		}
		
		// Add usage information after streaming completes
		const vercelUsage = await result.usage;
		
		// [DEBUG] Log raw vercelUsage object to see what API returns
		logger.debug(`[API Usage] Model: ${config.id}, Request ID: ${interactionId}`);
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
					prompt_tokens: vercelUsage.inputTokens ?? 0,
					completion_tokens: 0, // Request doesn't have completion tokens
					total_tokens: vercelUsage.inputTokens ?? 0,
				};
				logger.debug(`[API Usage] Updated request usage: ${JSON.stringify(existingLog.request.usage)}`);
			}
		}

		// Calculate total text content length for display purposes
		const totalTextLength = responseLog.textParts?.reduce((sum, part) => sum + part.value.length, 0) || 0;
		responseLog.textContentLength = totalTextLength;

		messageLogger.addRequestResponse(responseLog, interactionId);
		return;
	}

	private stripWorkspaceRootFromPath(filePath: string): string {
		const workspaceRoot = vscode.workspace.workspaceFolders
			? vscode.workspace.workspaceFolders[0].uri.fsPath
			: undefined;
		if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
			let relativePath = filePath.substring(workspaceRoot.length);
			// Remove leading slash if present
			if (relativePath.startsWith("/")) {
				relativePath = relativePath.substring(1);
			}
			return relativePath;
		}
		return filePath;
	}
	private generateTextPartForToolCall(part: TextStreamPart<ToolSet>): LanguageModelTextPart {
		const workspaceRoot = vscode.workspace.workspaceFolders
			? vscode.workspace.workspaceFolders[0].uri.fsPath
			: undefined;
		if (part.type !== "tool-call") {
			return new LanguageModelTextPart("");
		}
		switch (part.toolName) {
			case "Read":
				const readName = this.stripWorkspaceRootFromPath(part.input.file_path);
				return new LanguageModelTextPart(`\n\`${part.toolName}:\` ${readName}\n`);
			case "Write":
			case "Edit":
				const writeName = this.stripWorkspaceRootFromPath(part.input.file_path);
				return new LanguageModelTextPart(`\n\`${part.toolName}:\` ${writeName}\n`);
			// Add cases for specific tool names if needed
			case "Glob":
			case "Grep":
				const pattern = part.input.pattern;
				return new LanguageModelTextPart(`\n\`${part.toolName}:\` \`${pattern}\`\n`);
			case "Bash":
				const command = part.input.command;
				return new LanguageModelTextPart(`\n\`${part.toolName}:\` \`${command}\`\n`);
			case "WebSearch":
				const query = part.input.query;
				return new LanguageModelTextPart(`\n\`${part.toolName}:\` \`${query}\`\n`);
			case "WebFetch":
				const url = part.input.url;
				return new LanguageModelTextPart(`\n\`${part.toolName}:\` \`${url}\`\n`);
			default:
				return new LanguageModelTextPart(`\n\`${part.toolName}\`\n`);
		}
	}
}

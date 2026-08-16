import { AttachmentSummary } from './workspace/attachmentContext';
import { WorkspaceBatchSummary } from './workspace/workspaceActionBroker';
import { CommandBatchSummary } from './workspace/terminalActionBroker';

export type MessageRole = 'user' | 'assistant';
export type VoiceProvider = 'local' | 'openai';
export type OpenAiTone = 'casual' | 'professional' | 'custom';

export interface SelectOption {
	id: string;
	label: string;
}

export interface OpenAiUsage {
	inputTextTokens: number;
	inputAudioTokens: number;
	outputTextTokens: number;
	outputAudioTokens: number;
	cachedTokens: number;
	estimatedUsd: number;
}

export interface RealtimeResponseUsage {
	inputTextTokens?: number;
	inputAudioTokens?: number;
	outputTextTokens?: number;
	outputAudioTokens?: number;
	cachedTextTokens?: number;
	cachedAudioTokens?: number;
}

export interface ChatMessage {
	id: string;
	role: MessageRole;
	text: string;
	streaming?: boolean;
	attachments?: AttachmentSummary[];
}

export interface ModelOption {
	id: string;
	name: string;
	vendor: string;
	family: string;
}

export interface ViewState {
	messages: ChatMessage[];
	provider: VoiceProvider;
	models: ModelOption[];
	selectedModelId: string;
	openAiModels: SelectOption[];
	selectedOpenAiModel: string;
	openAiVoices: SelectOption[];
	selectedOpenAiVoice: string;
	openAiTone: OpenAiTone;
	openAiCustomTone: string;
	openAiLanguage: string;
	openAiEnabled: boolean;
	openAiKeyConfigured: boolean;
	openAiWorkspaceConsented: boolean;
	openAiConnected: boolean;
	openAiUsage: OpenAiUsage;
	openAiSpendingLimitUsd: number;
	sharedContext: AttachmentSummary[];
	voices: string[];
	selectedVoice: string;
	microphones: string[];
	selectedMicrophone: string;
	pendingAttachments: AttachmentSummary[];
	workspaceBatches: WorkspaceBatchSummary[];
	commandBatches: CommandBatchSummary[];
	commandAutoApprove: boolean;
	busy: boolean;
	voiceSessionActive: boolean;
	voicePhase: 'inactive' | 'idle' | 'listening' | 'transcribing' | 'reviewing' | 'thinking' | 'speaking';
	silenceMs: number;
	status: string;
}

export type WebviewMessage =
	| { type: 'ready' }
	| { type: 'send'; text: string }
	| { type: 'selectProvider'; provider: VoiceProvider }
	| { type: 'selectModel'; modelId: string }
	| { type: 'selectOpenAiModel'; modelId: string }
	| { type: 'selectOpenAiVoice'; voice: string }
	| { type: 'selectOpenAiTone'; tone: OpenAiTone }
	| { type: 'configureOpenAi' }
	| { type: 'removeOpenAiKey' }
	| { type: 'grantOpenAiConsent' }
	| { type: 'revokeOpenAiAccess' }
	| { type: 'selectVoice'; voice: string }
	| { type: 'selectMicrophone'; microphone: string }
	| { type: 'attachContext' }
	| { type: 'removeAttachment'; attachmentId: string }
	| { type: 'applyWorkspaceBatch'; batchId: string }
	| { type: 'rejectWorkspaceBatch'; batchId: string }
	| { type: 'undoWorkspaceBatch'; batchId: string }
	| { type: 'runCommandBatch'; batchId: string }
	| { type: 'rejectCommandBatch'; batchId: string }
	| { type: 'setCommandAutoApprove'; enabled: boolean }
	| { type: 'toggleVoiceSession' }
	| { type: 'toggleListening' }
	| { type: 'cancelTranscript' }
	| { type: 'stop' }
	| { type: 'stopTask' }
	| { type: 'openEditor' }
	| { type: 'realtimeReady' }
	| { type: 'realtimeSpeechStarted'; userMessageId: string; assistantMessageId: string }
	| { type: 'realtimeSpeechStopped'; assistantMessageId: string }
	| { type: 'realtimeInputTranscriptDelta'; userMessageId: string; text: string }
	| { type: 'realtimePlaybackStarted' }
	| { type: 'realtimePlaybackError'; message: string }
	| { type: 'realtimeTranscriptDelta'; messageId: string; text: string }
	| { type: 'realtimeResponseDone'; messageId: string; usage?: RealtimeResponseUsage }
	| { type: 'realtimeToolCall'; callId: string; name: string; arguments: string }
	| { type: 'realtimeError'; messageId?: string; message: string }
	| { type: 'realtimeDisconnected' };

export type ExtensionMessage =
	| { type: 'state'; state: ViewState }
	| { type: 'focusComposer' }
	| { type: 'transcript'; text: string; submitAfterMs?: number }
	| { type: 'startRealtimeVoiceSession'; clientSecret: string; context: string }
	| { type: 'startRealtimeSession'; clientSecret: string; messageId: string; text: string }
	| { type: 'realtimeAudioChunk'; audio: string }
	| { type: 'realtimeContextUpdate'; text: string }
	| { type: 'realtimeTurn'; messageId: string; text: string }
	| { type: 'realtimeToolResult'; callId: string; output: string }
	| { type: 'stopRealtimeResponse' }
	| { type: 'disposeRealtimeSession' };
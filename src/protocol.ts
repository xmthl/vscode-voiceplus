import { AttachmentSummary } from './workspace/attachmentContext';
import { WorkspaceBatchSummary } from './workspace/workspaceActionBroker';
import { CommandBatchSummary } from './workspace/terminalActionBroker';

export type MessageRole = 'user' | 'assistant';

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
	models: ModelOption[];
	selectedModelId: string;
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
	| { type: 'selectModel'; modelId: string }
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
	| { type: 'openEditor' };

export type ExtensionMessage =
	| { type: 'state'; state: ViewState }
	| { type: 'focusComposer' }
	| { type: 'transcript'; text: string; submitAfterMs?: number };
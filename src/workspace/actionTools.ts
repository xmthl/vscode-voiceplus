import * as vscode from 'vscode';

export const actionTools: vscode.LanguageModelChatTool[] = [
	{
		name: 'voiceplus_propose_file_changes',
		description: 'Propose an immutable, user-approved batch that creates folders, writes complete file contents, or deletes files. This tool never applies changes. Read existing files before proposing updates.',
		inputSchema: {
			type: 'object',
			properties: {
				plan: { type: 'string', description: 'A concise plain-language plan.' },
				changes: {
					type: 'array', minItems: 1, maxItems: 50,
					items: {
						oneOf: [
							{ type: 'object', properties: { operation: { const: 'write' }, path: { type: 'string' }, content: { type: 'string' } }, required: ['operation', 'path', 'content'], additionalProperties: false },
							{ type: 'object', properties: { operation: { const: 'delete' }, path: { type: 'string' } }, required: ['operation', 'path'], additionalProperties: false },
							{ type: 'object', properties: { operation: { const: 'createDirectory' }, path: { type: 'string' } }, required: ['operation', 'path'], additionalProperties: false },
						],
					},
				},
			},
			required: ['plan', 'changes'],
			additionalProperties: false,
		},
	},
	{
		name: 'voiceplus_propose_terminal_commands',
		description: 'Propose a separately approved batch of terminal commands. This tool never runs commands unless session auto-run is enabled and every command is classified as safe.',
		inputSchema: {
			type: 'object',
			properties: {
				plan: { type: 'string', description: 'A concise reason for running the commands.' },
				commands: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' } },
			},
			required: ['plan', 'commands'],
			additionalProperties: false,
		},
	},
];

export function isApprovalPhrase(text: string): boolean {
	return /^\s*(?:approve|apply)(?:\s+[\w-]+)?[.!]?\s*$/i.test(text);
}
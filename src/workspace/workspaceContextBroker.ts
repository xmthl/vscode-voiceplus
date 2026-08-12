import * as path from 'node:path';
import * as vscode from 'vscode';
import { ContextAttachment } from './attachmentContext';

const maximumFileBytes = 200_000;
const maximumActiveCharacters = 100_000;
const excludedDirectoryPattern = '**/{.git,.hg,.svn,.vscode-test,node_modules,dist,out,build,coverage,.next,.nuxt,vendor}/**';

export const workspaceTools: vscode.LanguageModelChatTool[] = [
	{
		name: 'voiceplus_list_workspace_files',
		description: 'List readable, non-sensitive files in the current VS Code workspace. Use this to learn the project structure or find likely files.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
	},
	{
		name: 'voiceplus_read_workspace_file',
		description: 'Read one non-sensitive UTF-8 text file from the current VS Code workspace by its relative path.',
		inputSchema: {
			type: 'object',
			properties: { path: { type: 'string', description: 'Workspace-relative file path returned by the list or search tool.' } },
			required: ['path'],
			additionalProperties: false,
		},
	},
	{
		name: 'voiceplus_search_workspace',
		description: 'Search readable, non-sensitive UTF-8 workspace files for an exact text query and return matching lines with paths.',
		inputSchema: {
			type: 'object',
			properties: { query: { type: 'string', description: 'Exact text to search for, without regular-expression syntax.' } },
			required: ['query'],
			additionalProperties: false,
		},
	},
];

export interface WorkspaceToolResult {
	text: string;
	attachments: ContextAttachment[];
}


export class WorkspaceContextBroker implements vscode.Disposable {
	private lastTextEditor = vscode.window.activeTextEditor;
	private readonly editorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && ['file', 'untitled'].includes(editor.document.uri.scheme)) {this.lastTextEditor = editor;}
	});

	dispose(): void {
		this.editorListener.dispose();
	}

	collectActiveEditor(): ContextAttachment[] {
		if (!vscode.workspace.isTrusted) {return [];}
		const editor = vscode.window.activeTextEditor ?? this.lastTextEditor;
		if (!editor || !['file', 'untitled'].includes(editor.document.uri.scheme)) {return [];}
		const location = this.displayPath(editor.document.uri);
		if (editor.document.uri.scheme === 'file' && isSensitiveWorkspacePath(location)) {return [];}
		const hasSelection = !editor.selection.isEmpty;
		const content = hasSelection ? editor.document.getText(editor.selection) : editor.document.getText();
		if (!content.trim()) {return [];}
		const startLine = editor.selection.start.line + 1;
		const endLine = editor.selection.end.line + 1;
		const selectionSuffix = hasSelection ? `#L${startLine}-L${endLine}` : '';
		return [{
			id: crypto.randomUUID(),
			kind: hasSelection ? 'selection' : 'file',
			label: hasSelection ? `${path.basename(location)}:${startLine}-${endLine}` : path.basename(location) || 'Untitled',
			location: `${location}${selectionSuffix}`,
			content: truncateText(content, maximumActiveCharacters),
		}];
	}

	describeWorkspace(): string {
		if (!vscode.workspace.isTrusted) {
			return 'The workspace is untrusted. Do not claim automatic workspace access; only explicitly attached content is available.';
		}
		const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.name) ?? [];
		return folders.length > 0
			? `Trusted workspace folders: ${folders.join(', ')}. Use the provided workspace tools whenever files beyond the active editor are needed.`
			: 'No workspace folder is open. The active editor may still be available.';
	}

	async invoke(name: string, input: object, token: vscode.CancellationToken): Promise<WorkspaceToolResult> {
		if (!vscode.workspace.isTrusted) {return { text: 'Workspace access is disabled because this workspace is not trusted.', attachments: [] };}
		switch (name) {
			case 'voiceplus_list_workspace_files': return this.listFiles(token);
			case 'voiceplus_read_workspace_file': return this.readFile(this.stringInput(input, 'path'), token);
			case 'voiceplus_search_workspace': return this.searchFiles(this.stringInput(input, 'query'), token);
			default: return { text: `Unknown workspace tool: ${name}`, attachments: [] };
		}
	}

	private async listFiles(token: vscode.CancellationToken): Promise<WorkspaceToolResult> {
		const uris = await vscode.workspace.findFiles('**/*', excludedDirectoryPattern, 300, token);
		const paths = uris.map((uri) => this.displayPath(uri)).filter((filePath) => !isSensitiveWorkspacePath(filePath)).sort();
		const text = paths.length > 0 ? paths.join('\n') : 'No readable workspace files were found.';
		return { text, attachments: [this.createAuditAttachment('workspace', 'Workspace files', 'workspace file index', text)] };
	}

	private async readFile(relativePath: string, token: vscode.CancellationToken): Promise<WorkspaceToolResult> {
		if (token.isCancellationRequested) {throw new vscode.CancellationError();}
		if (isSensitiveWorkspacePath(relativePath)) {return { text: 'Access denied: this path may contain credentials or other sensitive data.', attachments: [] };}
		const uri = await this.resolveWorkspaceFile(relativePath);
		if (!uri) {return { text: `File not found in the workspace: ${relativePath}`, attachments: [] };}
		const content = await this.readUtf8File(uri);
		const location = this.displayPath(uri);
		return { text: content, attachments: [this.createAuditAttachment('file', path.basename(location), location, content)] };
	}

	private async searchFiles(query: string, token: vscode.CancellationToken): Promise<WorkspaceToolResult> {
		const trimmedQuery = query.trim();
		if (trimmedQuery.length < 2 || trimmedQuery.length > 200) {
			return { text: 'Search queries must contain between 2 and 200 characters.', attachments: [] };
		}
		const uris = await vscode.workspace.findFiles('**/*', excludedDirectoryPattern, 250, token);
		const matches: string[] = [];
		for (const uri of uris) {
			if (token.isCancellationRequested) {throw new vscode.CancellationError();}
			const location = this.displayPath(uri);
			if (isSensitiveWorkspacePath(location)) {continue;}
			let content: string;
			try {content = await this.readUtf8File(uri);} catch {continue;}
			for (const [index, line] of content.split(/\r?\n/).entries()) {
				if (line.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase())) {
					matches.push(`${location}:${index + 1}: ${line.trim().slice(0, 500)}`);
					if (matches.length >= 50) {break;}
				}
			}
			if (matches.length >= 50) {break;}
		}
		const text = matches.length > 0 ? matches.join('\n') : `No matches found for: ${trimmedQuery}`;
		return { text, attachments: [this.createAuditAttachment('search', `Search: ${trimmedQuery}`, 'workspace search results', text)] };
	}

	private async resolveWorkspaceFile(requestedPath: string): Promise<vscode.Uri | undefined> {
		const normalized = requestedPath.replaceAll('\\', '/').replace(/^\.\//, '');
		if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').includes('..')) {return undefined;}
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			const folderPath = normalized.startsWith(`${folder.name}/`) ? normalized.slice(folder.name.length + 1) : normalized;
			const uri = vscode.Uri.joinPath(folder.uri, ...folderPath.split('/'));
			try {
				const stat = await vscode.workspace.fs.stat(uri);
				if ((stat.type & vscode.FileType.File) !== 0) {return uri;}
			} catch {}
		}
		return undefined;
	}

	private async readUtf8File(uri: vscode.Uri): Promise<string> {
		const stat = await vscode.workspace.fs.stat(uri);
		if (stat.size > maximumFileBytes) {throw new Error('File exceeds the 200 KB automatic context limit');}
		const bytes = await vscode.workspace.fs.readFile(uri);
		if (bytes.byteLength > maximumFileBytes) {throw new Error('File exceeds the 200 KB automatic context limit');}
		const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		if (content.includes('\0')) {throw new Error('Binary files are not available as automatic context');}
		return content;
	}

	private stringInput(input: object, key: string): string {
		const value = (input as Record<string, unknown>)[key];
		return typeof value === 'string' ? value : '';
	}

	private displayPath(uri: vscode.Uri): string {
		if (uri.scheme === 'untitled') {return uri.path || 'Untitled';}
		return vscode.workspace.getWorkspaceFolder(uri) ? vscode.workspace.asRelativePath(uri, false) : uri.fsPath;
	}

	private createAuditAttachment(kind: ContextAttachment['kind'], label: string, location: string, content: string): ContextAttachment {
		return { id: crypto.randomUUID(), kind, label, location, content };
	}
}

export function isSensitiveWorkspacePath(filePath: string): boolean {
	const normalized = filePath.replaceAll('\\', '/').toLocaleLowerCase();
	const segments = normalized.split('/');
	const basename = segments.at(-1) ?? '';
	if (segments.some((segment) => ['.git', '.ssh', '.aws', '.azure', 'credentials', 'secrets'].includes(segment))) {return true;}
	if (basename === '.env' || basename.startsWith('.env.')) {return true;}
	if (/^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.|$)/.test(basename)) {return true;}
	return /\.(pem|key|pfx|p12|keystore|jks)$/i.test(basename) || /(credential|secret|token|password)/i.test(basename);
}

function truncateText(content: string, maximumCharacters: number): string {
	return content.length <= maximumCharacters ? content : `${content.slice(0, maximumCharacters)}\n[Active editor truncated]`;
}
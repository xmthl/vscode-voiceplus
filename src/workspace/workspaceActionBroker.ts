import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { isSensitiveWorkspacePath } from './workspaceContextBroker';

const maximumChanges = 50;
const maximumContentCharacters = 500_000;

export type WorkspaceChangeInput =
	| { operation: 'write'; path: string; content: string }
	| { operation: 'delete'; path: string }
	| { operation: 'createDirectory'; path: string };

export interface WorkspaceBatchInput {
	plan: string;
	changes: WorkspaceChangeInput[];
}

export type WorkspaceBatchStatus = 'pending' | 'applied' | 'rejected' | 'undone';

export interface WorkspaceChangeSummary {
	operation: WorkspaceChangeInput['operation'];
	path: string;
	diff: string;
}

export interface WorkspaceBatchSummary {
	id: string;
	plan: string;
	status: WorkspaceBatchStatus;
	changes: WorkspaceChangeSummary[];
}

interface FileSnapshot {
	exists: boolean;
	type?: vscode.FileType;
	content?: Uint8Array;
}

interface PreparedChange {
	input: WorkspaceChangeInput;
	uri: vscode.Uri;
	before: FileSnapshot;
	after: FileSnapshot;
	summary: WorkspaceChangeSummary;
}

interface WorkspaceBatch {
	summary: WorkspaceBatchSummary;
	changes: PreparedChange[];
	createdDirectories: vscode.Uri[];
}

export class WorkspaceActionBroker implements vscode.Disposable {
	private readonly batches = new Map<string, WorkspaceBatch>();

	dispose(): void {
		this.batches.clear();
	}

	getBatches(): WorkspaceBatchSummary[] {
		return [...this.batches.values()].map(({ summary }) => cloneSummary(summary));
	}

	async propose(input: WorkspaceBatchInput): Promise<WorkspaceBatchSummary> {
		this.requireTrustedWorkspace();
		const plan = input.plan.trim();
		if (!plan) {throw new Error('A plain-language change plan is required');}
		if (input.changes.length === 0 || input.changes.length > maximumChanges) {
			throw new Error(`A change batch must contain between 1 and ${maximumChanges} operations`);
		}
		const seenPaths = new Set<string>();
		const changes: PreparedChange[] = [];
		for (const rawChange of input.changes) {
			const normalizedPath = normalizeWorkspacePath(rawChange.path);
			if (seenPaths.has(normalizedPath.toLocaleLowerCase())) {throw new Error(`Duplicate change path: ${normalizedPath}`);}
			seenPaths.add(normalizedPath.toLocaleLowerCase());
			if (isSensitiveWorkspacePath(normalizedPath)) {throw new Error(`Changes to sensitive paths are not allowed: ${normalizedPath}`);}
			if (rawChange.operation === 'write' && rawChange.content.length > maximumContentCharacters) {
				throw new Error(`File content exceeds ${maximumContentCharacters} characters: ${normalizedPath}`);
			}
			const inputChange = Object.freeze({ ...rawChange, path: normalizedPath }) as WorkspaceChangeInput;
			const uri = this.resolveWorkspaceUri(normalizedPath);
			const before = await snapshot(uri);
			const after = expectedAfter(inputChange);
			validateTransition(inputChange, before);
			changes.push({ input: inputChange, uri, before, after, summary: summarizeChange(inputChange, before) });
		}

		const summary: WorkspaceBatchSummary = {
			id: crypto.randomUUID(),
			plan,
			status: 'pending',
			changes: changes.map(({ summary: change }) => ({ ...change })),
		};
		this.batches.set(summary.id, { summary, changes, createdDirectories: [] });
		return cloneSummary(summary);
	}

	reject(batchId: string): WorkspaceBatchSummary {
		const batch = this.requireBatch(batchId, 'pending');
		batch.summary.status = 'rejected';
		return cloneSummary(batch.summary);
	}

	async apply(batchId: string): Promise<WorkspaceBatchSummary> {
		this.requireTrustedWorkspace();
		const batch = this.requireBatch(batchId, 'pending');
		await this.verifyState(batch.changes, 'before');
		batch.createdDirectories = await this.createRequiredDirectories(batch.changes);
		try {
			const edit = new vscode.WorkspaceEdit();
			for (const change of batch.changes) {await addForwardEdit(edit, change);}
			if (!await vscode.workspace.applyEdit(edit, { isRefactoring: true })) {
				throw new Error('VS Code could not apply the approved change batch');
			}
			batch.summary.status = 'applied';
			return cloneSummary(batch.summary);
		} catch (error) {
			await removeEmptyDirectories(batch.createdDirectories);
			batch.createdDirectories = [];
			throw error;
		}
	}

	async undo(batchId: string): Promise<WorkspaceBatchSummary> {
		this.requireTrustedWorkspace();
		const batch = this.requireBatch(batchId, 'applied');
		await this.verifyState(batch.changes, 'after');
		await this.verifyCreatedDirectories(batch);
		const edit = new vscode.WorkspaceEdit();
		for (const change of [...batch.changes].reverse()) {await addReverseEdit(edit, change);}
		if (!await vscode.workspace.applyEdit(edit, { isRefactoring: true })) {
			throw new Error('VS Code could not undo the approved change batch');
		}
		await removeEmptyDirectories(batch.createdDirectories);
		batch.summary.status = 'undone';
		return cloneSummary(batch.summary);
	}

	private requireTrustedWorkspace(): void {
		if (!vscode.workspace.isTrusted) {throw new Error('Workspace changes are disabled until this workspace is trusted');}
		if (!vscode.workspace.workspaceFolders?.length) {throw new Error('Open a workspace folder before proposing file changes');}
	}

	private requireBatch(batchId: string, status: WorkspaceBatchStatus): WorkspaceBatch {
		const batch = this.batches.get(batchId);
		if (!batch) {throw new Error('The change batch no longer exists');}
		if (batch.summary.status !== status) {throw new Error(`The change batch is ${batch.summary.status}, not ${status}`);}
		return batch;
	}

	private resolveWorkspaceUri(normalizedPath: string): vscode.Uri {
		const folders = vscode.workspace.workspaceFolders!;
		if (folders.length === 1) {return vscode.Uri.joinPath(folders[0].uri, ...normalizedPath.split('/'));}
		const folder = folders.find((candidate) => normalizedPath.startsWith(`${candidate.name}/`));
		if (!folder) {throw new Error('Paths in a multi-root workspace must begin with the workspace folder name');}
		return vscode.Uri.joinPath(folder.uri, ...normalizedPath.slice(folder.name.length + 1).split('/'));
	}

	private async verifyState(changes: PreparedChange[], key: 'before' | 'after'): Promise<void> {
		for (const change of changes) {
			const current = await snapshot(change.uri);
			if (!snapshotsEqual(current, change[key])) {
				const phase = key === 'after' ? 'changed since VoicePlus applied it' : 'changed since VoicePlus proposed the batch';
				throw new Error(`${change.input.path} ${phase}`);
			}
		}
	}

	private async createRequiredDirectories(changes: PreparedChange[]): Promise<vscode.Uri[]> {
		const candidates = new Map<string, vscode.Uri>();
		for (const change of changes) {
			if (change.input.operation === 'delete') {continue;}
			let directory = change.input.operation === 'createDirectory' ? change.uri : vscode.Uri.joinPath(change.uri, '..');
			while (vscode.workspace.getWorkspaceFolder(directory) && !await exists(directory)) {
				candidates.set(directory.toString(), directory);
				directory = vscode.Uri.joinPath(directory, '..');
			}
		}
		const directories = [...candidates.values()].sort((left, right) => left.path.length - right.path.length);
		for (const directory of directories) {await vscode.workspace.fs.createDirectory(directory);}
		return directories;
	}

	private async verifyCreatedDirectories(batch: WorkspaceBatch): Promise<void> {
		const createdPaths = new Set(batch.changes.filter((change) => change.before.exists === false).map((change) => change.uri.toString()));
		for (const directory of [...batch.createdDirectories].sort((left, right) => right.path.length - left.path.length)) {
			for (const [name] of await vscode.workspace.fs.readDirectory(directory)) {
				const child = vscode.Uri.joinPath(directory, name).toString();
				if (!createdPaths.has(child) && !batch.createdDirectories.some((candidate) => candidate.toString() === child)) {
					throw new Error(`${path.basename(directory.fsPath)} changed since VoicePlus applied it`);
				}
			}
		}
	}
}

function normalizeWorkspacePath(filePath: string): string {
	const normalized = filePath.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
	if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').includes('..')) {
		throw new Error(`Invalid workspace-relative path: ${filePath}`);
	}
	return normalized;
}

async function snapshot(uri: vscode.Uri): Promise<FileSnapshot> {
	try {
		const stat = await vscode.workspace.fs.stat(uri);
		return (stat.type & vscode.FileType.File) !== 0
			? { exists: true, type: vscode.FileType.File, content: await vscode.workspace.fs.readFile(uri) }
			: { exists: true, type: stat.type };
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {return { exists: false };}
		throw error;
	}
}

function expectedAfter(change: WorkspaceChangeInput): FileSnapshot {
	switch (change.operation) {
		case 'write': return { exists: true, type: vscode.FileType.File, content: Buffer.from(change.content) };
		case 'delete': return { exists: false };
		case 'createDirectory': return { exists: true, type: vscode.FileType.Directory };
	}
}

function validateTransition(change: WorkspaceChangeInput, before: FileSnapshot): void {
	if (change.operation === 'delete' && !before.exists) {throw new Error(`Cannot delete a missing file: ${change.path}`);}
	if (change.operation === 'delete' && before.type !== vscode.FileType.File) {throw new Error(`Folder deletion is not supported: ${change.path}`);}
	if (change.operation === 'write' && before.exists && before.type !== vscode.FileType.File) {throw new Error(`Cannot write over a folder: ${change.path}`);}
	if (change.operation === 'createDirectory' && before.exists) {throw new Error(`Folder already exists: ${change.path}`);}
}

function summarizeChange(change: WorkspaceChangeInput, before: FileSnapshot): WorkspaceChangeSummary {
	const oldText = before.content ? Buffer.from(before.content).toString('utf8') : '';
	const newText = change.operation === 'write' ? change.content : '';
	const oldPath = before.exists ? change.path : '/dev/null';
	const newPath = change.operation === 'delete' ? '/dev/null' : change.path;
	const removed = oldText ? oldText.split(/\r?\n/).map((line) => `-${line}`).join('\n') : '';
	const added = newText ? newText.split(/\r?\n/).map((line) => `+${line}`).join('\n') : '';
	const body = [removed, added].filter(Boolean).join('\n');
	return { operation: change.operation, path: change.path, diff: `--- ${oldPath}\n+++ ${newPath}${body ? `\n${body}` : ''}` };
}

async function addForwardEdit(edit: vscode.WorkspaceEdit, change: PreparedChange): Promise<void> {
	switch (change.input.operation) {
		case 'write':
			if (!change.before.exists) {edit.createFile(change.uri, { contents: change.after.content });}
			else {edit.replace(change.uri, await entireDocumentRange(change.uri), change.input.content);}
			break;
		case 'delete': edit.deleteFile(change.uri); break;
		case 'createDirectory': break;
	}
}

async function addReverseEdit(edit: vscode.WorkspaceEdit, change: PreparedChange): Promise<void> {
	if (change.input.operation === 'createDirectory') {return;}
	if (!change.before.exists) {
		edit.deleteFile(change.uri, { ignoreIfNotExists: false });
	} else if (!change.after.exists) {
		edit.createFile(change.uri, { contents: change.before.content });
	} else {
		edit.replace(change.uri, await entireDocumentRange(change.uri), Buffer.from(change.before.content!).toString('utf8'));
	}
}

async function entireDocumentRange(uri: vscode.Uri): Promise<vscode.Range> {
	const document = await vscode.workspace.openTextDocument(uri);
	if (document.isDirty) {throw new Error(`${vscode.workspace.asRelativePath(uri, false)} has unsaved changes`);}
	return new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
}

function snapshotsEqual(left: FileSnapshot, right: FileSnapshot): boolean {
	if (left.exists !== right.exists || left.type !== right.type) {return false;}
	if (!left.content && !right.content) {return true;}
	if (!left.content || !right.content) {return false;}
	return digest(left.content) === digest(right.content);
}

function digest(content: Uint8Array): string {
	return createHash('sha256').update(content).digest('hex');
}

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {await vscode.workspace.fs.stat(uri); return true;} catch {return false;}
}

async function removeEmptyDirectories(directories: vscode.Uri[]): Promise<void> {
	for (const directory of [...directories].sort((left, right) => right.path.length - left.path.length)) {
		try {await vscode.workspace.fs.delete(directory, { recursive: false, useTrash: false });} catch {}
	}
}

function cloneSummary(summary: WorkspaceBatchSummary): WorkspaceBatchSummary {
	return { ...summary, changes: summary.changes.map((change) => ({ ...change })) };
}
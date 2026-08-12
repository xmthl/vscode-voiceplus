import * as vscode from 'vscode';

const maximumCommands = 10;
const maximumCommandCharacters = 4_000;
const maximumOutputCharacters = 100_000;

export interface CommandBatchInput {
	plan: string;
	commands: string[];
}

export type CommandBatchStatus = 'pending' | 'running' | 'completed' | 'failed' | 'rejected' | 'stopped';

export interface CommandBatchSummary {
	id: string;
	plan: string;
	commands: string[];
	status: CommandBatchStatus;
	autoApproveEligible: boolean;
	output: string;
	exitCodes: Array<number | undefined>;
}

interface CommandBatch {
	summary: CommandBatchSummary;
}

export class TerminalActionBroker implements vscode.Disposable {
	private readonly batches = new Map<string, CommandBatch>();
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChange = this.changeEmitter.event;
	private terminal?: vscode.Terminal;
	private activeBatchId?: string;
	private readonly closeListener = vscode.window.onDidCloseTerminal((terminal) => {
		if (terminal !== this.terminal) {return;}
		this.terminal = undefined;
		const active = this.activeBatchId ? this.batches.get(this.activeBatchId) : undefined;
		if (active?.summary.status === 'running') {active.summary.status = 'stopped';}
		this.activeBatchId = undefined;
		this.changeEmitter.fire();
	});

	dispose(): void {
		this.activeBatchId = undefined;
		this.terminal?.dispose();
		this.terminal = undefined;
		this.closeListener.dispose();
		this.changeEmitter.dispose();
		this.batches.clear();
	}

	getBatches(): CommandBatchSummary[] {
		return [...this.batches.values()].map(({ summary }) => cloneSummary(summary));
	}

	propose(input: CommandBatchInput): CommandBatchSummary {
		this.requireTrustedWorkspace();
		const plan = input.plan.trim();
		if (!plan) {throw new Error('A plain-language command plan is required');}
		if (input.commands.length === 0 || input.commands.length > maximumCommands) {
			throw new Error(`A command batch must contain between 1 and ${maximumCommands} commands`);
		}
		const commands = input.commands.map((command) => {
			const normalized = command.trim();
			if (!normalized || normalized.length > maximumCommandCharacters || /[\r\n\0]/.test(normalized)) {
				throw new Error('Commands must be non-empty single lines no longer than 4,000 characters');
			}
			return normalized;
		});
		const summary: CommandBatchSummary = {
			id: crypto.randomUUID(),
			plan,
			commands,
			status: 'pending',
			autoApproveEligible: commands.every(isCommandAutoApproveEligible),
			output: '',
			exitCodes: [],
		};
		this.batches.set(summary.id, { summary });
		this.changeEmitter.fire();
		return cloneSummary(summary);
	}

	reject(batchId: string): CommandBatchSummary {
		const batch = this.requireBatch(batchId, 'pending');
		batch.summary.status = 'rejected';
		this.changeEmitter.fire();
		return cloneSummary(batch.summary);
	}

	async run(batchId: string): Promise<CommandBatchSummary> {
		this.requireTrustedWorkspace();
		if (this.activeBatchId) {throw new Error('Another VoicePlus command batch is already running');}
		const batch = this.requireBatch(batchId, 'pending');
		const terminal = this.getTerminal();
		terminal.show(true);
		batch.summary.status = 'running';
		this.activeBatchId = batchId;
		this.changeEmitter.fire();
		try {
			const integration = await this.waitForShellIntegration(terminal);
			for (const command of batch.summary.commands) {
				if (this.activeBatchId !== batchId) {throw new Error('Command batch was stopped');}
				this.appendOutput(batch, `> ${command}\n`);
				const execution = integration.executeCommand(command);
				const outputPromise = this.captureOutput(batch, execution);
				const exitCode = await this.waitForExecutionEnd(terminal, execution);
				await outputPromise;
				batch.summary.exitCodes.push(exitCode);
				this.appendOutput(batch, `\n[exit ${exitCode ?? 'unknown'}]\n`);
				if (exitCode !== 0) {
					batch.summary.status = 'failed';
					return cloneSummary(batch.summary);
				}
			}
			batch.summary.status = 'completed';
			return cloneSummary(batch.summary);
		} catch (error) {
			if (this.activeBatchId !== batchId) {return cloneSummary(batch.summary);}
			batch.summary.status = 'failed';
			this.appendOutput(batch, `\n${error instanceof Error ? error.message : String(error)}\n`);
			return cloneSummary(batch.summary);
		} finally {
			if (this.activeBatchId === batchId) {this.activeBatchId = undefined;}
			this.changeEmitter.fire();
		}
	}

	stop(): void {
		if (!this.activeBatchId) {return;}
		const batch = this.batches.get(this.activeBatchId);
		if (batch) {batch.summary.status = 'stopped';}
		this.activeBatchId = undefined;
		const terminal = this.terminal;
		this.terminal = undefined;
		terminal?.dispose();
		this.changeEmitter.fire();
	}

	private requireTrustedWorkspace(): void {
		if (!vscode.workspace.isTrusted) {throw new Error('Terminal commands are disabled until this workspace is trusted');}
		if (!vscode.workspace.workspaceFolders?.length) {throw new Error('Open a workspace folder before proposing terminal commands');}
	}

	private requireBatch(batchId: string, status: CommandBatchStatus): CommandBatch {
		const batch = this.batches.get(batchId);
		if (!batch) {throw new Error('The command batch no longer exists');}
		if (batch.summary.status !== status) {throw new Error(`The command batch is ${batch.summary.status}, not ${status}`);}
		return batch;
	}

	private getTerminal(): vscode.Terminal {
		this.terminal ??= vscode.window.createTerminal({
			name: 'VoicePlus',
			cwd: vscode.workspace.workspaceFolders?.[0].uri,
			isTransient: true,
		});
		return this.terminal;
	}

	private waitForShellIntegration(terminal: vscode.Terminal): Promise<vscode.TerminalShellIntegration> {
		if (terminal.shellIntegration) {return Promise.resolve(terminal.shellIntegration);}
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				integrationListener.dispose();
				closeListener.dispose();
				reject(new Error('VS Code terminal shell integration did not become available'));
			}, 5_000);
			const finish = () => {
				clearTimeout(timeout);
				integrationListener.dispose();
				closeListener.dispose();
			};
			const integrationListener = vscode.window.onDidChangeTerminalShellIntegration((event) => {
				if (event.terminal !== terminal) {return;}
				finish();
				resolve(event.shellIntegration);
			});
			const closeListener = vscode.window.onDidCloseTerminal((closed) => {
				if (closed !== terminal) {return;}
				finish();
				reject(new Error('VoicePlus terminal was closed'));
			});
		});
	}

	private waitForExecutionEnd(terminal: vscode.Terminal, execution: vscode.TerminalShellExecution): Promise<number | undefined> {
		return new Promise((resolve) => {
			const finish = (exitCode: number | undefined) => {
				endListener.dispose();
				closeListener.dispose();
				resolve(exitCode);
			};
			const endListener = vscode.window.onDidEndTerminalShellExecution((event) => {
				if (event.terminal !== terminal || event.execution !== execution) {return;}
				finish(event.exitCode);
			});
			const closeListener = vscode.window.onDidCloseTerminal((closed) => {
				if (closed === terminal) {finish(undefined);}
			});
		});
	}

	private async captureOutput(batch: CommandBatch, execution: vscode.TerminalShellExecution): Promise<void> {
		for await (const data of execution.read()) {this.appendOutput(batch, stripAnsi(data));}
	}

	private appendOutput(batch: CommandBatch, output: string): void {
		batch.summary.output = `${batch.summary.output}${output}`.slice(-maximumOutputCharacters);
		this.changeEmitter.fire();
	}
}

export function isCommandAutoApproveEligible(command: string): boolean {
	const normalized = command.trim().toLocaleLowerCase();
	if (/[;&|`]|\$\(|\r|\n/.test(normalized)) {return false;}
	return ![
		/\bgit\s+push\b/,
		/\bgit\s+reset\b.*--hard/,
		/\bgit\s+clean\b/,
		/\bgit\s+branch\b.*\s-d\b/,
		/\b(remove-item|rm|rmdir|del)\b.*(-recurse|-force|\/s|\/q)/,
		/\b(sudo|runas)\b/,
		/\bstart-process\b.*\b-verb\s+runas\b/,
		/\b(shutdown|restart-computer|stop-computer|format|diskpart)\b/,
	].some((pattern) => pattern.test(normalized));
}

function cloneSummary(summary: CommandBatchSummary): CommandBatchSummary {
	return { ...summary, commands: [...summary.commands], exitCodes: [...summary.exitCodes] };
}

function stripAnsi(value: string): string {
	return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}
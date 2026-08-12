import * as assert from 'assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { splitAudioForTranscription } from '../speech/audioChunking';
import { extractSpokenSummary } from '../speech/spokenSummary';
import { ContextAttachment, formatMessageWithContext, summarizeAttachment } from '../workspace/attachmentContext';
import { isSensitiveWorkspacePath, WorkspaceContextBroker, workspaceTools } from '../workspace/workspaceContextBroker';
import { WorkspaceActionBroker } from '../workspace/workspaceActionBroker';
import { isCommandAutoApproveEligible, TerminalActionBroker } from '../workspace/terminalActionBroker';
import { isApprovalPhrase } from '../workspace/actionTools';

suite('Extension Test Suite', () => {
	test('registers the primary VoicePlus commands', async () => {
		const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === 'voiceplus');
		assert.ok(extension, 'VoicePlus extension should be loaded by the test host');
		await extension.activate();
		const commands = await vscode.commands.getCommands(true);

		assert.ok(commands.includes('voiceplus.openChat'));
		assert.ok(commands.includes('voiceplus.toggleListening'));
		assert.ok(commands.includes('voiceplus.selectVoice'));
		assert.ok(commands.includes('voiceplus.selectMicrophone'));
		assert.ok(commands.includes('voiceplus.attachContext'));
	});

	test('prefers the explicit spoken summary', () => {
		const response = 'Detailed answer with `code`.\n\n## Spoken summary\nFirst point. Second point.';

		assert.strictEqual(extractSpokenSummary(response), 'First point. Second point.');
	});

	test('limits fallback speech to four sentences and removes code blocks', () => {
		const response = 'One. ```ts\nconst hidden = true;\n``` Two! Three? Four. Five.';

		assert.strictEqual(extractSpokenSummary(response), 'One. Two! Three? Four.');
	});

	test('splits long recordings into lossless model-safe windows', () => {
		const sampleRate = 16_000;
		const samples = Float32Array.from({ length: sampleRate * 20 }, (_, index) => index);
		const chunks = splitAudioForTranscription(samples, sampleRate);

		assert.ok(chunks.length > 1);
		assert.ok(chunks.every((chunk) => chunk.length <= sampleRate * 8));
		assert.deepStrictEqual(Array.from(chunks.flatMap((chunk) => Array.from(chunk))), Array.from(samples));
	});

	test('keeps attachment content out of UI summaries and adds it to model context', () => {
		const attachment: ContextAttachment = {
			id: 'attachment-1',
			kind: 'selection',
			label: 'config.ts:2-3',
			location: 'src/config.ts#L2-L3',
			content: 'const privateContext = true;',
		};

		assert.deepStrictEqual(summarizeAttachment(attachment), {
			id: attachment.id,
			kind: attachment.kind,
			label: attachment.label,
			location: attachment.location,
		});
		assert.ok(!JSON.stringify(summarizeAttachment(attachment)).includes('privateContext'));
		assert.ok(formatMessageWithContext('Explain this.', [attachment]).includes(attachment.content));
	});

	test('offers guarded read-only workspace tools', () => {
		assert.deepStrictEqual(workspaceTools.map((tool) => tool.name), [
			'voiceplus_list_workspace_files',
			'voiceplus_read_workspace_file',
			'voiceplus_search_workspace',
		]);
		assert.strictEqual(isSensitiveWorkspacePath('src/app.ts'), false);
		assert.strictEqual(isSensitiveWorkspacePath('.env.local'), true);
		assert.strictEqual(isSensitiveWorkspacePath('config/client-secret.json'), true);
		assert.strictEqual(isSensitiveWorkspacePath('.ssh/id_ed25519'), true);
	});

	test('automatically captures the active editor', async () => {
		const document = await vscode.workspace.openTextDocument({ content: 'VoicePlus can read this active buffer.', language: 'plaintext' });
		await vscode.window.showTextDocument(document);
		const broker = new WorkspaceContextBroker();
		try {
			const context = broker.collectActiveEditor();
			assert.strictEqual(context.length, 1);
			assert.strictEqual(context[0].content, 'VoicePlus can read this active buffer.');
		} finally {
			broker.dispose();
		}
	});

	test('lists, reads, and searches trusted workspace files', async () => {
		assert.ok(vscode.workspace.isTrusted);
		assert.ok(vscode.workspace.workspaceFolders?.length);
		const broker = new WorkspaceContextBroker();
		const cancellation = new vscode.CancellationTokenSource();
		try {
			const listed = await broker.invoke('voiceplus_list_workspace_files', {}, cancellation.token);
			assert.ok(listed.text.includes('package.json'));
			const read = await broker.invoke('voiceplus_read_workspace_file', { path: 'package.json' }, cancellation.token);
			assert.ok(read.text.includes('"name": "voiceplus"'));
			const searched = await broker.invoke('voiceplus_search_workspace', { query: 'voiceplus.attachContext' }, cancellation.token);
			assert.ok(searched.text.includes('package.json'));
		} finally {
			cancellation.dispose();
			broker.dispose();
		}
	});

	test('applies proposed file changes only after approval and undoes without overwriting later work', async () => {
		const workspaceUri = vscode.workspace.workspaceFolders![0].uri;
		const fixture = vscode.Uri.joinPath(workspaceUri, `.voiceplus-action-test-${crypto.randomUUID()}`);
		const originalUri = vscode.Uri.joinPath(fixture, 'original.txt');
		const createdUri = vscode.Uri.joinPath(fixture, 'nested', 'created.txt');
		await vscode.workspace.fs.createDirectory(fixture);
		await vscode.workspace.fs.writeFile(originalUri, Buffer.from('before'));
		const broker = new WorkspaceActionBroker();
		try {
			const batch = await broker.propose({
				plan: 'Update one file and create another.',
				changes: [
					{ operation: 'write', path: `${path.basename(fixture.fsPath)}/original.txt`, content: 'after' },
					{ operation: 'write', path: `${path.basename(fixture.fsPath)}/nested/created.txt`, content: 'new' },
				],
			});
			assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(originalUri)).toString(), 'before');
			await assert.rejects(Promise.resolve(vscode.workspace.fs.stat(createdUri)));

			const applied = await broker.apply(batch.id);
			assert.strictEqual(applied.status, 'applied');
			assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(originalUri)).toString(), 'after');
			assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(createdUri)).toString(), 'new');

			await vscode.workspace.fs.writeFile(originalUri, Buffer.from('user changed this later'));
			await assert.rejects(() => broker.undo(batch.id), /changed since VoicePlus applied/);
			await vscode.workspace.fs.writeFile(originalUri, Buffer.from('after'));
			const undone = await broker.undo(batch.id);
			assert.strictEqual(undone.status, 'undone');
			assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(originalUri)).toString(), 'before');
			await assert.rejects(Promise.resolve(vscode.workspace.fs.stat(createdUri)));
		} finally {
			broker.dispose();
			await vscode.workspace.fs.delete(fixture, { recursive: true, useTrash: false });
		}
	});

	test('keeps terminal commands behind a separate approval policy', () => {
		assert.strictEqual(isCommandAutoApproveEligible('npm test'), true);
		assert.strictEqual(isCommandAutoApproveEligible('git push origin main'), false);
		assert.strictEqual(isCommandAutoApproveEligible('git reset --hard HEAD~1'), false);
		assert.strictEqual(isCommandAutoApproveEligible('Start-Process powershell -Verb RunAs'), false);
		assert.strictEqual(isCommandAutoApproveEligible('Remove-Item -Recurse -Force .'), false);
		const broker = new TerminalActionBroker();
		try {
			const batch = broker.propose({ plan: 'Run the focused tests.', commands: ['npm test'] });
			assert.strictEqual(batch.status, 'pending');
			assert.strictEqual(batch.autoApproveEligible, true);
			assert.strictEqual(broker.reject(batch.id).status, 'rejected');
			assert.throws(() => broker.reject(batch.id), /rejected, not pending/);
		} finally {
			broker.dispose();
		}
	});

	test('runs an approved command in the VoicePlus terminal and captures its result', async function () {
		this.timeout(15_000);
		const broker = new TerminalActionBroker();
		try {
			const batch = broker.propose({ plan: 'Verify terminal execution.', commands: ['Write-Output voiceplus-terminal-ok'] });
			const completed = await broker.run(batch.id);
			assert.strictEqual(completed.status, 'completed');
			assert.deepStrictEqual(completed.exitCodes, [0]);
			assert.ok(completed.output.includes('voiceplus-terminal-ok'));
		} finally {
			broker.dispose();
		}
	});

	test('requires spoken approval phrases to wait for manual submission', () => {
		assert.strictEqual(isApprovalPhrase('approve'), true);
		assert.strictEqual(isApprovalPhrase('Apply 1234abcd.'), true);
		assert.strictEqual(isApprovalPhrase('please approve this'), false);
	});
});

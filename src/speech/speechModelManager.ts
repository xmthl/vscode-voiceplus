import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);
const archiveName = 'sherpa-onnx-moonshine-base-en-quantized-2026-02-27.tar.bz2';
const modelFolderName = 'sherpa-onnx-moonshine-base-en-quantized-2026-02-27';
const modelUrl = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${archiveName}`;
const expectedBytes = 111_266_225;
const expectedSha256 = '43232c1d13013d37317163baec3135bd771a186a4356f28c889bab453bb0e891';

export class SpeechModelManager {
	readonly storagePath: string;
	readonly modelPath: string;

	constructor(globalStorageUri: vscode.Uri) {
		this.storagePath = path.join(globalStorageUri.fsPath, 'speech');
		this.modelPath = path.join(this.storagePath, modelFolderName);
	}

	isInstalled(): boolean {
		return this.requiredFiles().every((file) => existsSync(file));
	}

	async install(): Promise<void> {
		await mkdir(this.storagePath, { recursive: true });
		const archivePath = path.join(this.storagePath, archiveName);

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Installing VoicePlus local speech model',
				cancellable: false,
			},
			async (progress) => {
				progress.report({ message: 'Downloading Moonshine Base English' });
				await this.downloadAndVerify(archivePath, progress);
				progress.report({ message: 'Extracting model' });
				await rm(this.modelPath, { recursive: true, force: true });
				await execFileAsync('tar.exe', ['-xjf', archivePath, '-C', this.storagePath], { windowsHide: true });
				for (const file of this.requiredFiles()) {
					await access(file);
				}
				await rm(archivePath, { force: true });
			},
		);
	}

	private requiredFiles(): string[] {
		return [
			path.join(this.modelPath, 'encoder_model.ort'),
			path.join(this.modelPath, 'decoder_model_merged.ort'),
			path.join(this.modelPath, 'tokens.txt'),
		];
	}

	private async downloadAndVerify(archivePath: string, progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<void> {
		await rm(archivePath, { force: true });
		const response = await fetch(modelUrl, { redirect: 'follow' });
		if (!response.ok || !response.body) {
			throw new Error(`Model download returned HTTP ${response.status}`);
		}

		const contentLength = Number(response.headers.get('content-length')) || expectedBytes;
		const hash = createHash('sha256');
		let downloaded = 0;
		let lastPercent = 0;
		const tracker = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				hash.update(chunk);
				downloaded += chunk.length;
				const percent = Math.floor((downloaded / contentLength) * 100);
				if (percent > lastPercent) {
					progress.report({ message: `Downloading Moonshine Base English (${percent}%)`, increment: percent - lastPercent });
					lastPercent = percent;
				}
				callback(null, chunk);
			},
		});

		try {
			await pipeline(Readable.fromWeb(response.body as never), tracker, createWriteStream(archivePath));
			if (downloaded !== expectedBytes) {
				throw new Error(`Downloaded ${downloaded} bytes; expected ${expectedBytes}`);
			}
			if (hash.digest('hex') !== expectedSha256) {
				throw new Error('Speech model checksum did not match the published release digest');
			}
		} catch (error) {
			await rm(archivePath, { force: true });
			throw error;
		}
	}
}
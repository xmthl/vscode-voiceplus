import { ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export class LocalSpeechSynthesizer implements vscode.Disposable {
	private process?: ChildProcessWithoutNullStreams;
	private interrupted = false;

	async getVoices(): Promise<string[]> {
		const script = [
			'Add-Type -AssemblyName System.Speech',
			'$speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()',
			'$voices = @($speaker.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { $_.VoiceInfo.Name })',
			'$speaker.Dispose()',
			'$voices | ConvertTo-Json -Compress',
		].join('; ');
		const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
		const output = stdout.trim();
		if (!output) {return [];}
		const voices: unknown = JSON.parse(output);
		return (Array.isArray(voices) ? voices : [voices]).filter((voice): voice is string => typeof voice === 'string');
	}

	async speak(text: string): Promise<boolean> {
		this.stop();
		this.interrupted = false;
		const configuration = vscode.workspace.getConfiguration('voiceplus.speech');
		const voice = configuration.get<string>('voice', '');
		const speed = configuration.get<number>('rate', 1);
		const sapiRate = Math.max(-10, Math.min(10, Math.round((speed - 1) * 6)));
		const encodedText = Buffer.from(text, 'utf8').toString('base64');
		const encodedVoice = Buffer.from(voice, 'utf8').toString('base64');
		const script = [
			'Add-Type -AssemblyName System.Speech',
			'$speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()',
			`$speaker.Rate = ${sapiRate}`,
			`$voice = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedVoice}'))`,
			"if ($voice) { $speaker.SelectVoice($voice) }",
			`$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedText}'))`,
			'$speaker.Speak($text)',
			'$speaker.Dispose()',
		].join('; ');

		return new Promise<boolean>((resolve, reject) => {
			const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
			this.process = child;
			child.once('error', reject);
			child.once('exit', (code) => {
				if (this.process === child) {
					this.process = undefined;
				}
				if (this.interrupted) {
					resolve(false);
				} else if (code === 0) {
					resolve(true);
				} else {
					reject(new Error(`Windows speech synthesis exited with code ${code ?? 'unknown'}`));
				}
			});
		});
	}

	stop(): void {
		if (this.process) {
			this.interrupted = true;
			this.process.kill();
			this.process = undefined;
		}
	}

	dispose(): void {
		this.stop();
	}
}
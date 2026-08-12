import { PvRecorder } from '@picovoice/pvrecorder-node';

const frameLength = 512;
const bufferedFrames = 100;
const speechThreshold = 0.012;

export interface MicrophoneRecording {
	samples: Float32Array;
	sampleRate: number;
}

export class LocalMicrophone {
	private recorder?: PvRecorder;
	private capturePromise?: Promise<void>;
	private chunks: Float32Array[] = [];
	private sampleCount = 0;
	private sampleRate = 0;
	private heardSpeech = false;
	private silenceStartedAt = 0;
	private finishRequested = false;

	getDevices(): string[] {
		return PvRecorder.getAvailableDevices();
	}

	async start(
		silenceMs: number,
		onSilence: () => void,
		onError: (error: unknown) => void,
		preferredDevice = '',
	): Promise<string> {
		await this.cancel();
		const devices = this.getDevices();
		const deviceIndex = preferredDevice ? devices.indexOf(preferredDevice) : -1;
		const recorder = new PvRecorder(frameLength, deviceIndex, bufferedFrames);
		recorder.start();
		this.recorder = recorder;
		this.sampleRate = recorder.sampleRate;
		this.capturePromise = this.capture(recorder, silenceMs, onSilence, onError);
		return recorder.getSelectedDevice();
	}

	async finish(): Promise<MicrophoneRecording | undefined> {
		if (!this.recorder) {
			return undefined;
		}
		await this.stopRecorder();
		if (!this.heardSpeech || this.sampleCount === 0) {
			this.reset();
			return undefined;
		}
		const samples = new Float32Array(this.sampleCount);
		let offset = 0;
		for (const chunk of this.chunks) {
			samples.set(chunk, offset);
			offset += chunk.length;
		}
		const recording = { samples, sampleRate: this.sampleRate };
		this.reset();
		return recording;
	}

	async cancel(): Promise<void> {
		await this.stopRecorder();
		this.reset();
	}

	private async capture(
		recorder: PvRecorder,
		silenceMs: number,
		onSilence: () => void,
		onError: (error: unknown) => void,
	): Promise<void> {
		try {
			while (this.recorder === recorder && recorder.isRecording) {
				const frame = await recorder.read();
				if (this.recorder !== recorder) {
					return;
				}
				const samples = Float32Array.from(frame, (sample) => sample / 32768);
				this.chunks.push(samples);
				this.sampleCount += samples.length;
				const rms = this.rootMeanSquare(samples);
				if (rms >= speechThreshold) {
					this.heardSpeech = true;
					this.silenceStartedAt = 0;
				} else if (this.heardSpeech) {
					this.silenceStartedAt ||= Date.now();
					if (!this.finishRequested && Date.now() - this.silenceStartedAt >= silenceMs) {
						this.finishRequested = true;
						setImmediate(onSilence);
					}
				}
			}
		} catch (error) {
			if (this.recorder === recorder) {
				this.recorder = undefined;
				if (recorder.isRecording) {recorder.stop();}
				recorder.release();
				this.capturePromise = undefined;
				setImmediate(() => onError(error));
			}
		}
	}

	private async stopRecorder(): Promise<void> {
		const recorder = this.recorder;
		const capturePromise = this.capturePromise;
		if (!recorder) {
			return;
		}
		this.recorder = undefined;
		if (recorder.isRecording) {recorder.stop();}
		await capturePromise;
		recorder.release();
		this.capturePromise = undefined;
	}

	private reset(): void {
		this.chunks = [];
		this.sampleCount = 0;
		this.heardSpeech = false;
		this.silenceStartedAt = 0;
		this.finishRequested = false;
	}

	private rootMeanSquare(samples: Float32Array): number {
		let energy = 0;
		for (const sample of samples) {
			energy += sample * sample;
		}
		return Math.sqrt(energy / samples.length);
	}
}
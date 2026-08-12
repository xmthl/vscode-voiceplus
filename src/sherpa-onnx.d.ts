declare module 'sherpa-onnx' {
	export interface OfflineStream {
		acceptWaveform(sampleRate: number, samples: Float32Array): void;
		free(): void;
	}

	export interface OfflineRecognizer {
		createStream(): OfflineStream;
		decode(stream: OfflineStream): void;
		getResult(stream: OfflineStream): { text: string };
		free(): void;
	}

	export function createOfflineRecognizer(config: unknown): OfflineRecognizer;
}
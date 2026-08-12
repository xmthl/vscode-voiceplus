import * as path from 'node:path';
import sherpaOnnx = require('sherpa-onnx');
import { splitAudioForTranscription } from './audioChunking';
import { SpeechModelManager } from './speechModelManager';

export class LocalTranscriber {
	private recognizer?: sherpaOnnx.OfflineRecognizer;

	constructor(private readonly modelManager: SpeechModelManager) {}

	transcribe(samples: Float32Array, sampleRate: number): string {
		const recognizer = this.getRecognizer();
		const transcripts: string[] = [];
		for (const chunk of splitAudioForTranscription(samples, sampleRate)) {
			const transcript = this.transcribeChunk(recognizer, chunk, sampleRate);
			if (transcript) {transcripts.push(transcript);}
		}
		return transcripts.join(' ');
	}

	private transcribeChunk(recognizer: sherpaOnnx.OfflineRecognizer, samples: Float32Array, sampleRate: number): string {
		const stream = recognizer.createStream();
		try {
			stream.acceptWaveform(sampleRate, samples);
			recognizer.decode(stream);
			return recognizer.getResult(stream).text.trim();
		} catch (error) {
			if (typeof error === 'number') {
				throw new Error('The local speech model could not decode this audio segment');
			}
			throw error;
		} finally {
			stream.free();
		}
	}

	dispose(): void {
		this.recognizer?.free();
		this.recognizer = undefined;
	}

	private getRecognizer(): sherpaOnnx.OfflineRecognizer {
		if (!this.modelManager.isInstalled()) {
			throw new Error('The local speech model is not installed');
		}
		this.recognizer ??= sherpaOnnx.createOfflineRecognizer({
			modelConfig: {
				moonshine: {
					encoder: path.join(this.modelManager.modelPath, 'encoder_model.ort'),
					mergedDecoder: path.join(this.modelManager.modelPath, 'decoder_model_merged.ort'),
				},
				tokens: path.join(this.modelManager.modelPath, 'tokens.txt'),
			},
		});
		return this.recognizer;
	}
}
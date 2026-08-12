const maximumChunkSeconds = 8;
const minimumChunkSeconds = 6;
const boundaryWindowSeconds = 0.02;

export function splitAudioForTranscription(samples: Float32Array, sampleRate: number): Float32Array[] {
	const maximumChunkSamples = Math.floor(sampleRate * maximumChunkSeconds);
	if (samples.length <= maximumChunkSamples) {
		return [samples];
	}

	const minimumChunkSamples = Math.floor(sampleRate * minimumChunkSeconds);
	const boundaryWindowSamples = Math.max(1, Math.floor(sampleRate * boundaryWindowSeconds));
	const chunks: Float32Array[] = [];
	let offset = 0;
	while (samples.length - offset > maximumChunkSamples) {
		const firstBoundary = offset + minimumChunkSamples;
		const lastBoundary = offset + maximumChunkSamples;
		const boundary = findQuietestBoundary(samples, firstBoundary, lastBoundary, boundaryWindowSamples);
		chunks.push(samples.slice(offset, boundary));
		offset = boundary;
	}
	chunks.push(samples.slice(offset));
	return chunks;
}

function findQuietestBoundary(samples: Float32Array, first: number, last: number, windowSize: number): number {
	let quietestBoundary = last;
	let quietestEnergy = Number.POSITIVE_INFINITY;
	for (let boundary = first; boundary <= last; boundary += windowSize) {
		const windowStart = Math.max(0, boundary - Math.floor(windowSize / 2));
		const windowEnd = Math.min(samples.length, windowStart + windowSize);
		let energy = 0;
		for (let index = windowStart; index < windowEnd; index++) {
			energy += samples[index] * samples[index];
		}
		if (energy < quietestEnergy) {
			quietestEnergy = energy;
			quietestBoundary = boundary;
		}
	}
	return quietestBoundary;
}
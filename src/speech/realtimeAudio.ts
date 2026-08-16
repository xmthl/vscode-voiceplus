export function resamplePcm16(samples: Int16Array, sourceRate: number, targetRate: number): Int16Array {
	if (sourceRate <= 0 || targetRate <= 0) {throw new Error('Audio sample rates must be positive');}
	if (samples.length === 0) {return new Int16Array();}
	if (sourceRate === targetRate) {return Int16Array.from(samples);}
	const output = new Int16Array(Math.max(1, Math.round(samples.length * targetRate / sourceRate)));
	for (let index = 0; index < output.length; index++) {
		const position = index * sourceRate / targetRate;
		const lowerIndex = Math.min(samples.length - 1, Math.floor(position));
		const upperIndex = Math.min(samples.length - 1, lowerIndex + 1);
		const fraction = position - lowerIndex;
		output[index] = Math.round(samples[lowerIndex] + (samples[upperIndex] - samples[lowerIndex]) * fraction);
	}
	return output;
}

export function encodePcm16Base64(samples: Int16Array): string {
	return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).toString('base64');
}
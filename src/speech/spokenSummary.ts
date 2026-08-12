export function extractSpokenSummary(response: string): string {
	const match = response.match(/(?:^|\n)#{0,3}\s*Spoken summary\s*:?\s*([\s\S]+)$/i);
	const source = (match?.[1] ?? response)
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/[`*_#>]/g, ' ');
	const sentences = source.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
	return sentences.slice(0, 4).join(' ').replace(/\s+/g, ' ').trim().slice(0, 900);
}
const vscode = acquireVsCodeApi();
const elements = {
	model: document.getElementById('model'), microphone: document.getElementById('microphone'), voice: document.getElementById('voice'),
	voiceSelect: document.getElementById('voiceSelect'), microphoneSelect: document.getElementById('microphoneSelect'),
	providerLocal: document.getElementById('providerLocal'), providerOpenAi: document.getElementById('providerOpenAi'),
	localVoiceSetting: document.getElementById('localVoiceSetting'), openAiPanel: document.getElementById('openAiPanel'),
	openAiModel: document.getElementById('openAiModel'), openAiVoice: document.getElementById('openAiVoice'), openAiTone: document.getElementById('openAiTone'),
	cloudStatus: document.getElementById('cloudStatus'), openAiUsage: document.getElementById('openAiUsage'), sharedContext: document.getElementById('sharedContext'),
	configureOpenAi: document.getElementById('configureOpenAi'), grantOpenAiConsent: document.getElementById('grantOpenAiConsent'),
	removeOpenAiKey: document.getElementById('removeOpenAiKey'), revokeOpenAiAccess: document.getElementById('revokeOpenAiAccess'),
	expand: document.getElementById('expand'), messages: document.getElementById('messages'), voiceState: document.getElementById('voiceState'),
	composer: document.getElementById('composer'), status: document.getElementById('status'), send: document.getElementById('send'),
	attach: document.getElementById('attach'), pendingAttachments: document.getElementById('pendingAttachments'),
	stopTask: document.getElementById('stopTask'), commandAutoApprove: document.getElementById('commandAutoApprove'),
};
let state;
let reviewTimer;
let reviewInterval;
let peerConnection;
let realtimeEvents;
let realtimeAudio;
let realtimeAudioContext;
let realtimeAudioSource;
let realtimeMessageId;
let realtimeUserMessageId;
let realtimeInputTranscript = '';
let realtimeTranscript = '';
let realtimeAudioPlaying = false;
let pendingRealtimeCompletion;
let closingRealtime = false;
let realtimeVoiceMode = false;

function send() {
	clearReview();
	const text = elements.composer.value.trim();
	if (!text || state?.busy) return;
	vscode.postMessage({ type: 'send', text });
	elements.composer.value = '';
}

function render(next) {
	state = next;
	const openAiSelected = next.provider === 'openai';
	elements.providerLocal.classList.toggle('active', !openAiSelected);
	elements.providerOpenAi.classList.toggle('active', openAiSelected);
	elements.providerLocal.setAttribute('aria-pressed', String(!openAiSelected));
	elements.providerOpenAi.setAttribute('aria-pressed', String(openAiSelected));
	elements.providerOpenAi.disabled = !next.openAiEnabled;
	elements.model.classList.toggle('hidden', openAiSelected);
	elements.localVoiceSetting.classList.toggle('hidden', openAiSelected);
	elements.openAiPanel.classList.toggle('hidden', !openAiSelected);
	elements.model.replaceChildren(...next.models.map(model => {
		const option = document.createElement('option');
		option.value = model.id;
		option.textContent = model.name;
		option.selected = model.id === next.selectedModelId;
		return option;
	}));
	elements.openAiModel.replaceChildren(...next.openAiModels.map(model => createOption(model.id, model.label, next.selectedOpenAiModel)));
	elements.openAiVoice.replaceChildren(...next.openAiVoices.map(voice => createOption(voice.id, voice.label, next.selectedOpenAiVoice)));
	elements.openAiTone.value = next.openAiTone;
	elements.cloudStatus.textContent = next.openAiConnected ? 'Realtime connected' : 'Cloud audio';
	elements.cloudStatus.classList.toggle('connected', next.openAiConnected);
	elements.openAiUsage.textContent = `Session est. $${next.openAiUsage.estimatedUsd.toFixed(4)}${next.openAiSpendingLimitUsd > 0 ? ` / $${next.openAiSpendingLimitUsd.toFixed(2)}` : ''}`;
	elements.configureOpenAi.textContent = next.openAiKeyConfigured ? 'Replace key' : 'Add API key';
	elements.openAiModel.disabled = next.busy;
	elements.openAiVoice.disabled = next.busy;
	elements.openAiTone.disabled = next.busy;
	elements.configureOpenAi.disabled = next.busy;
	elements.grantOpenAiConsent.classList.toggle('hidden', !next.openAiKeyConfigured || next.openAiWorkspaceConsented);
	elements.removeOpenAiKey.classList.toggle('hidden', !next.openAiKeyConfigured);
	elements.revokeOpenAiAccess.classList.toggle('hidden', !next.openAiWorkspaceConsented);
	elements.sharedContext.textContent = next.sharedContext.length > 0
		? `Microphone audio, prompts + ${next.sharedContext.map(attachment => attachment.location).join(', ')}`
		: 'Microphone audio + prompts';
	elements.voiceSelect.replaceChildren(createOption('', 'Windows default', next.selectedVoice), ...next.voices.map(voice => createOption(voice, voice, next.selectedVoice)));
	elements.microphoneSelect.replaceChildren(createOption('', 'Windows default', next.selectedMicrophone), ...next.microphones.map(microphone => createOption(microphone, microphone, next.selectedMicrophone)));
	elements.voice.classList.toggle('active', next.voiceSessionActive);
	elements.voice.setAttribute('aria-pressed', String(next.voiceSessionActive));
	elements.microphone.classList.toggle('active', next.voicePhase === 'listening');
	elements.microphone.textContent = next.voicePhase === 'listening' ? 'Stop' : 'Mic';
	elements.voiceState.classList.toggle('active', next.voiceSessionActive);
	elements.voiceState.textContent = next.voiceSessionActive ? `Voice session · ${next.voicePhase}` : '';
	if (!reviewTimer) elements.status.textContent = next.status;
	elements.send.textContent = next.busy ? 'Stop' : 'Send';
	elements.commandAutoApprove.checked = next.commandAutoApprove;
	elements.stopTask.classList.toggle('visible', next.busy || next.commandBatches.some(batch => batch.status === 'running'));
	elements.pendingAttachments.replaceChildren(...next.pendingAttachments.map(attachment => createAttachmentChip(attachment, true)));
	elements.messages.replaceChildren();
	if (next.messages.length === 0) {
		const empty = document.createElement('section'); empty.className = 'empty';
		const heading = document.createElement('h1'); heading.textContent = 'VoicePlus';
		const copy = document.createElement('p'); copy.textContent = 'A focused conversation with your codebase.';
		empty.append(heading, copy); elements.messages.append(empty);
	} else {
		for (const message of next.messages) {
			const article = document.createElement('article'); article.className = `message ${message.role}`;
			const text = document.createElement('div'); text.textContent = message.text || '…'; article.append(text);
			if (message.attachments?.length) {
				const context = document.createElement('div'); context.className = 'message-context';
				context.append(...message.attachments.map(attachment => createAttachmentChip(attachment, false))); article.append(context);
			}
			elements.messages.append(article);
		}
	}
	for (const batch of next.workspaceBatches) elements.messages.append(createWorkspaceBatch(batch));
	for (const batch of next.commandBatches) elements.messages.append(createCommandBatch(batch));
	elements.messages.scrollTop = elements.messages.scrollHeight;
}

function createOption(value, label, selectedValue) {
	const option = document.createElement('option');
	option.value = value;
	option.textContent = label;
	option.selected = value === selectedValue;
	return option;
}

function createAttachmentChip(attachment, removable) {
	const chip = document.createElement('span'); chip.className = 'attachment-chip'; chip.title = attachment.location;
	const label = document.createElement('span'); label.textContent = attachment.label; chip.append(label);
	if (removable) {
		const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'x'; remove.title = `Remove ${attachment.label}`;
		remove.addEventListener('click', () => vscode.postMessage({ type: 'removeAttachment', attachmentId: attachment.id })); chip.append(remove);
	}
	return chip;
}

function createWorkspaceBatch(batch) {
	const card = createBatchCard('File changes', batch);
	for (const change of batch.changes) {
		const details = document.createElement('details'); details.className = 'batch-details';
		const summary = document.createElement('summary'); summary.textContent = `${change.operation} · ${change.path}`;
		const diff = document.createElement('pre'); diff.textContent = change.diff; details.append(summary, diff); card.append(details);
	}
	const controls = document.createElement('div'); controls.className = 'batch-controls';
	if (batch.status === 'pending') {
		controls.append(actionButton('Apply', 'applyWorkspaceBatch', batch.id, true), actionButton('Reject', 'rejectWorkspaceBatch', batch.id));
	} else if (batch.status === 'applied') controls.append(actionButton('Undo', 'undoWorkspaceBatch', batch.id));
	card.append(controls); return card;
}

function createCommandBatch(batch) {
	const card = createBatchCard('Terminal commands', batch);
	const commands = document.createElement('pre'); commands.className = 'commands'; commands.textContent = batch.commands.map(command => `> ${command}`).join('\n'); card.append(commands);
	if (!batch.autoApproveEligible) {
		const warning = document.createElement('div'); warning.className = 'batch-warning'; warning.textContent = 'Manual approval required'; card.append(warning);
	}
	if (batch.output) {
		const details = document.createElement('details'); details.className = 'batch-details';
		const summary = document.createElement('summary'); summary.textContent = 'Output';
		const output = document.createElement('pre'); output.textContent = batch.output; details.append(summary, output); card.append(details);
	}
	const controls = document.createElement('div'); controls.className = 'batch-controls';
	if (batch.status === 'pending') controls.append(actionButton('Run', 'runCommandBatch', batch.id, true), actionButton('Reject', 'rejectCommandBatch', batch.id));
	if (batch.status === 'running') controls.append(actionButton('Stop', 'stopTask', batch.id));
	card.append(controls); return card;
}

function createBatchCard(kind, batch) {
	const card = document.createElement('section'); card.className = `batch-card ${batch.status}`;
	const heading = document.createElement('div'); heading.className = 'batch-heading';
	const title = document.createElement('strong'); title.textContent = kind;
	const status = document.createElement('span'); status.textContent = `${batch.status} · ${batch.id.slice(0, 8)}`;
	const plan = document.createElement('p'); plan.textContent = batch.plan; heading.append(title, status); card.append(heading, plan); return card;
}

function actionButton(label, type, batchId, primary = false) {
	const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
	button.className = primary ? 'primary' : 'secondary'; button.addEventListener('click', () => vscode.postMessage({ type, batchId })); return button;
}

function reviewTranscript(text, submitAfterMs) {
	clearReview();
	elements.composer.value = text;
	elements.composer.focus();
	if (!submitAfterMs) {
		elements.status.textContent = 'Approval phrase ready for review';
		return;
	}
	const deadline = Date.now() + submitAfterMs;
	const update = () => elements.status.textContent = `Sending transcript in ${Math.max(0, ((deadline - Date.now()) / 1000)).toFixed(1)}s · Esc to cancel`;
	update();
	reviewInterval = setInterval(update, 100);
	reviewTimer = setTimeout(send, submitAfterMs);
}

function clearReview() {
	if (reviewTimer) clearTimeout(reviewTimer);
	if (reviewInterval) clearInterval(reviewInterval);
	reviewTimer = undefined;
	reviewInterval = undefined;
}

elements.send.addEventListener('click', () => state?.busy ? vscode.postMessage({ type: 'stop' }) : send());
elements.composer.addEventListener('keydown', event => {
	if (event.key === 'Escape' && reviewTimer) {
		clearReview();
		elements.status.textContent = 'Transcript cancelled';
		vscode.postMessage({ type: 'cancelTranscript' });
	} else if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		send();
	}
});
elements.model.addEventListener('change', () => vscode.postMessage({ type: 'selectModel', modelId: elements.model.value }));
elements.providerLocal.addEventListener('click', () => vscode.postMessage({ type: 'selectProvider', provider: 'local' }));
elements.providerOpenAi.addEventListener('click', () => vscode.postMessage({ type: 'selectProvider', provider: 'openai' }));
elements.openAiModel.addEventListener('change', () => vscode.postMessage({ type: 'selectOpenAiModel', modelId: elements.openAiModel.value }));
elements.openAiVoice.addEventListener('change', () => vscode.postMessage({ type: 'selectOpenAiVoice', voice: elements.openAiVoice.value }));
elements.openAiTone.addEventListener('change', () => vscode.postMessage({ type: 'selectOpenAiTone', tone: elements.openAiTone.value }));
elements.configureOpenAi.addEventListener('click', () => vscode.postMessage({ type: 'configureOpenAi' }));
elements.grantOpenAiConsent.addEventListener('click', () => vscode.postMessage({ type: 'grantOpenAiConsent' }));
elements.removeOpenAiKey.addEventListener('click', () => vscode.postMessage({ type: 'removeOpenAiKey' }));
elements.revokeOpenAiAccess.addEventListener('click', () => vscode.postMessage({ type: 'revokeOpenAiAccess' }));
elements.attach.addEventListener('click', () => vscode.postMessage({ type: 'attachContext' }));
elements.stopTask.addEventListener('click', () => vscode.postMessage({ type: 'stopTask' }));
elements.commandAutoApprove.addEventListener('change', () => vscode.postMessage({ type: 'setCommandAutoApprove', enabled: elements.commandAutoApprove.checked }));
elements.voiceSelect.addEventListener('change', () => vscode.postMessage({ type: 'selectVoice', voice: elements.voiceSelect.value }));
elements.microphoneSelect.addEventListener('change', () => vscode.postMessage({ type: 'selectMicrophone', microphone: elements.microphoneSelect.value }));
elements.voice.addEventListener('click', () => {
	unlockRealtimeAudio();
	vscode.postMessage({ type: 'toggleVoiceSession' });
});
elements.microphone.addEventListener('click', () => {
	unlockRealtimeAudio();
	vscode.postMessage({ type: 'toggleListening' });
});
elements.expand.addEventListener('click', () => vscode.postMessage({ type: 'openEditor' }));
window.addEventListener('message', async event => {
	const message = event.data;
	if (message.type === 'state') render(message.state);
	if (message.type === 'focusComposer') elements.composer.focus();
	if (message.type === 'transcript') reviewTranscript(message.text, message.submitAfterMs);
	if (message.type === 'startRealtimeVoiceSession') await startRealtimeVoiceSession(message);
	if (message.type === 'startRealtimeSession') await startRealtimeSession(message);
	if (message.type === 'realtimeTurn') sendRealtimeTurn(message.messageId, message.text);
	if (message.type === 'realtimeAudioChunk') sendRealtimeAudio(message.audio);
	if (message.type === 'realtimeContextUpdate') sendRealtimeContext(message.text);
	if (message.type === 'realtimeToolResult') sendRealtimeToolResult(message.callId, message.output);
	if (message.type === 'stopRealtimeResponse') cancelRealtimeResponse();
	if (message.type === 'disposeRealtimeSession') disposeRealtimeSession();
});

async function startRealtimeSession(message) {
	await connectRealtime(message.clientSecret, () => sendRealtimeTurn(message.messageId, message.text), message.messageId);
}

async function startRealtimeVoiceSession(message) {
	await connectRealtime(message.clientSecret, () => {
		realtimeVoiceMode = true;
		if (message.context) {
			sendRealtimeEvent({
				type: 'conversation.item.create',
				item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: message.context }] },
			});
		}
	});
}

async function connectRealtime(clientSecret, onOpen, messageId) {
	disposeRealtimeSession();
	closingRealtime = false;
	realtimeMessageId = messageId;
	realtimeTranscript = '';
	try {
		peerConnection = new RTCPeerConnection();
		realtimeAudio = document.createElement('audio');
		realtimeAudio.autoplay = true;
		realtimeAudio.hidden = true;
		realtimeAudio.playsInline = true;
		realtimeAudio.muted = false;
		realtimeAudio.volume = 1;
		realtimeAudio.addEventListener('playing', () => vscode.postMessage({ type: 'realtimePlaybackStarted' }));
		realtimeAudio.addEventListener('error', () => {
			const detail = realtimeAudio?.error?.message || `Media error ${realtimeAudio?.error?.code ?? 'unknown'}`;
			vscode.postMessage({ type: 'realtimePlaybackError', message: detail });
		});
		document.body.append(realtimeAudio);
		peerConnection.ontrack = async event => {
			const stream = event.streams[0] ?? new MediaStream([event.track]);
			realtimeAudio.srcObject = stream;
			try {
				await realtimeAudio.play();
			} catch (error) {
				try {
					await playRealtimeAudioWithWebAudio(stream);
				} catch (fallbackError) {
					const mediaError = error instanceof Error ? error.message : String(error);
					const webAudioError = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
					vscode.postMessage({ type: 'realtimePlaybackError', message: `${mediaError}; Web Audio fallback: ${webAudioError}` });
				}
			}
		};
		peerConnection.onconnectionstatechange = () => {
			if (!closingRealtime && ['failed', 'disconnected'].includes(peerConnection?.connectionState)) {
				vscode.postMessage({ type: 'realtimeDisconnected' });
			}
		};
		peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
		realtimeEvents = peerConnection.createDataChannel('oai-events');
		realtimeEvents.addEventListener('message', handleRealtimeEvent);
		const opened = new Promise((resolve, reject) => {
			realtimeEvents.addEventListener('open', resolve, { once: true });
			realtimeEvents.addEventListener('error', () => reject(new Error('The OpenAI Realtime event channel failed to open.')), { once: true });
		});
		const offer = await peerConnection.createOffer();
		await peerConnection.setLocalDescription(offer);
		const response = await fetch('https://api.openai.com/v1/realtime/calls', {
			method: 'POST',
			headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
			body: offer.sdp,
		});
		if (!response.ok) {throw new Error(`OpenAI Realtime connection failed (${response.status}).`);}
		await peerConnection.setRemoteDescription({ type: 'answer', sdp: await response.text() });
		await opened;
		vscode.postMessage({ type: 'realtimeReady' });
		onOpen();
	} catch (error) {
		vscode.postMessage({ type: 'realtimeError', messageId, message: error instanceof Error ? error.message : String(error) });
		disposeRealtimeSession();
	}
}

async function playRealtimeAudioWithWebAudio(stream) {
	realtimeAudioContext ??= new AudioContext();
	if (realtimeAudioContext.state === 'suspended') await realtimeAudioContext.resume();
	if (realtimeAudioSource) realtimeAudioSource.disconnect();
	realtimeAudioSource = realtimeAudioContext.createMediaStreamSource(stream);
	realtimeAudioSource.connect(realtimeAudioContext.destination);
	vscode.postMessage({ type: 'realtimePlaybackStarted' });
}

function unlockRealtimeAudio() {
	try {
		realtimeAudioContext ??= new AudioContext();
		if (realtimeAudioContext.state === 'suspended') {
			void realtimeAudioContext.resume().catch(error => {
				vscode.postMessage({ type: 'realtimePlaybackError', message: error instanceof Error ? error.message : String(error) });
			});
		}
	} catch (error) {
		vscode.postMessage({ type: 'realtimePlaybackError', message: error instanceof Error ? error.message : String(error) });
	}
}

function sendRealtimeAudio(audio) {
	if (!realtimeVoiceMode || realtimeEvents?.readyState !== 'open') return;
	if (realtimeEvents.bufferedAmount > 1_000_000) return;
	sendRealtimeEvent({ type: 'input_audio_buffer.append', audio });
}

function sendRealtimeContext(text) {
	if (!realtimeVoiceMode || realtimeEvents?.readyState !== 'open') return;
	sendRealtimeEvent({
		type: 'conversation.item.create',
		item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
	});
}

function sendRealtimeTurn(messageId, text) {
	if (realtimeEvents?.readyState !== 'open') {
		vscode.postMessage({ type: 'realtimeError', messageId, message: 'OpenAI Realtime is not connected.' });
		return;
	}
	realtimeMessageId = messageId;
	realtimeTranscript = '';
	realtimeAudioPlaying = false;
	pendingRealtimeCompletion = undefined;
	sendRealtimeEvent({
		type: 'conversation.item.create',
		item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
	});
	sendRealtimeEvent({ type: 'response.create' });
}

function sendRealtimeToolResult(callId, output) {
	if (realtimeEvents?.readyState !== 'open') return;
	sendRealtimeEvent({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } });
	sendRealtimeEvent({ type: 'response.create' });
}

function handleRealtimeEvent(event) {
	let message;
	try { message = JSON.parse(event.data); } catch { return; }
	if (message.type === 'response.output_audio_transcript.delta' && typeof message.delta === 'string') {
		realtimeTranscript += message.delta;
		vscode.postMessage({ type: 'realtimeTranscriptDelta', messageId: realtimeMessageId, text: realtimeTranscript });
	} else if (message.type === 'response.output_audio_transcript.done' && typeof message.transcript === 'string') {
		realtimeTranscript = message.transcript;
		vscode.postMessage({ type: 'realtimeTranscriptDelta', messageId: realtimeMessageId, text: realtimeTranscript });
	} else if (message.type === 'input_audio_buffer.speech_started' && realtimeVoiceMode) {
		realtimeUserMessageId = crypto.randomUUID();
		realtimeMessageId = crypto.randomUUID();
		realtimeInputTranscript = '';
		realtimeTranscript = '';
		pendingRealtimeCompletion = undefined;
		vscode.postMessage({
			type: 'realtimeSpeechStarted',
			userMessageId: realtimeUserMessageId,
			assistantMessageId: realtimeMessageId,
		});
	} else if (message.type === 'input_audio_buffer.speech_stopped' && realtimeVoiceMode) {
		vscode.postMessage({ type: 'realtimeSpeechStopped', assistantMessageId: realtimeMessageId });
	} else if (message.type === 'conversation.item.input_audio_transcription.delta' && realtimeVoiceMode && typeof message.delta === 'string') {
		realtimeInputTranscript += message.delta;
		vscode.postMessage({ type: 'realtimeInputTranscriptDelta', userMessageId: realtimeUserMessageId, text: realtimeInputTranscript });
	} else if (message.type === 'conversation.item.input_audio_transcription.completed' && realtimeVoiceMode && typeof message.transcript === 'string') {
		realtimeInputTranscript = message.transcript;
		vscode.postMessage({ type: 'realtimeInputTranscriptDelta', userMessageId: realtimeUserMessageId, text: realtimeInputTranscript });
	} else if (message.type === 'response.function_call_arguments.done') {
		vscode.postMessage({ type: 'realtimeToolCall', callId: message.call_id, name: message.name, arguments: message.arguments });
	} else if (message.type === 'output_audio_buffer.started') {
		realtimeAudioPlaying = true;
		if (realtimeAudio?.paused) {
			void realtimeAudio.play()
				.catch(error => {
					if (!(realtimeAudio?.srcObject instanceof MediaStream)) {
						vscode.postMessage({ type: 'realtimePlaybackError', message: error instanceof Error ? error.message : String(error) });
						return;
					}
					void playRealtimeAudioWithWebAudio(realtimeAudio.srcObject)
						.catch(fallbackError => vscode.postMessage({ type: 'realtimePlaybackError', message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) }));
				});
		}
	} else if (message.type === 'output_audio_buffer.stopped') {
		realtimeAudioPlaying = false;
		if (pendingRealtimeCompletion) finishRealtimeResponse();
	} else if (message.type === 'response.done') {
		const response = message.response;
		if (response?.status === 'failed') {
			vscode.postMessage({ type: 'realtimeError', messageId: realtimeMessageId, message: response.status_details?.error?.message || 'OpenAI could not complete the response.' });
			return;
		}
		if (response?.status === 'cancelled') {
			if (!realtimeVoiceMode) vscode.postMessage({ type: 'realtimeResponseDone', messageId: realtimeMessageId, usage: normalizeRealtimeUsage(response.usage) });
			return;
		}
		const hasAssistantMessage = response?.output?.some(item => item.type === 'message' && item.role === 'assistant');
		if (hasAssistantMessage) {
			pendingRealtimeCompletion = { usage: normalizeRealtimeUsage(response.usage) };
			if (!realtimeAudioPlaying) finishRealtimeResponse();
		}
	} else if (message.type === 'error') {
		vscode.postMessage({ type: 'realtimeError', messageId: realtimeMessageId, message: message.error?.message || 'OpenAI Realtime reported an error.' });
	}
}

function finishRealtimeResponse() {
	vscode.postMessage({ type: 'realtimeResponseDone', messageId: realtimeMessageId, usage: pendingRealtimeCompletion?.usage });
	pendingRealtimeCompletion = undefined;
}

function normalizeRealtimeUsage(usage) {
	if (!usage) return undefined;
	return {
		inputTextTokens: usage.input_token_details?.text_tokens,
		inputAudioTokens: usage.input_token_details?.audio_tokens,
		outputTextTokens: usage.output_token_details?.text_tokens,
		outputAudioTokens: usage.output_token_details?.audio_tokens,
		cachedTextTokens: usage.input_token_details?.cached_tokens_details?.text_tokens,
		cachedAudioTokens: usage.input_token_details?.cached_tokens_details?.audio_tokens,
	};
}

function cancelRealtimeResponse() {
	if (realtimeEvents?.readyState === 'open') sendRealtimeEvent({ type: 'response.cancel' });
}

function sendRealtimeEvent(message) {
	realtimeEvents.send(JSON.stringify(message));
}

function disposeRealtimeSession() {
	closingRealtime = true;
	if (realtimeEvents) realtimeEvents.close();
	if (peerConnection) peerConnection.close();
	if (realtimeAudioSource) realtimeAudioSource.disconnect();
	if (realtimeAudio) {
		realtimeAudio.srcObject = null;
		realtimeAudio.remove();
	}
	peerConnection = undefined;
	realtimeEvents = undefined;
	realtimeAudio = undefined;
	realtimeAudioSource = undefined;
	realtimeMessageId = undefined;
	realtimeUserMessageId = undefined;
	realtimeInputTranscript = '';
	realtimeTranscript = '';
	realtimeAudioPlaying = false;
	pendingRealtimeCompletion = undefined;
	realtimeVoiceMode = false;
}

window.addEventListener('beforeunload', disposeRealtimeSession);
vscode.postMessage({ type: 'ready' });
const vscode = acquireVsCodeApi();
const elements = {
	model: document.getElementById('model'), microphone: document.getElementById('microphone'), voice: document.getElementById('voice'),
	voiceSelect: document.getElementById('voiceSelect'), microphoneSelect: document.getElementById('microphoneSelect'),
	expand: document.getElementById('expand'), messages: document.getElementById('messages'), voiceState: document.getElementById('voiceState'),
	composer: document.getElementById('composer'), status: document.getElementById('status'), send: document.getElementById('send'),
	attach: document.getElementById('attach'), pendingAttachments: document.getElementById('pendingAttachments'),
	stopTask: document.getElementById('stopTask'), commandAutoApprove: document.getElementById('commandAutoApprove'),
};
let state;
let reviewTimer;
let reviewInterval;

function send() {
	clearReview();
	const text = elements.composer.value.trim();
	if (!text || state?.busy) return;
	vscode.postMessage({ type: 'send', text });
	elements.composer.value = '';
}

function render(next) {
	state = next;
	elements.model.replaceChildren(...next.models.map(model => {
		const option = document.createElement('option');
		option.value = model.id;
		option.textContent = model.name;
		option.selected = model.id === next.selectedModelId;
		return option;
	}));
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
elements.attach.addEventListener('click', () => vscode.postMessage({ type: 'attachContext' }));
elements.stopTask.addEventListener('click', () => vscode.postMessage({ type: 'stopTask' }));
elements.commandAutoApprove.addEventListener('change', () => vscode.postMessage({ type: 'setCommandAutoApprove', enabled: elements.commandAutoApprove.checked }));
elements.voiceSelect.addEventListener('change', () => vscode.postMessage({ type: 'selectVoice', voice: elements.voiceSelect.value }));
elements.microphoneSelect.addEventListener('change', () => vscode.postMessage({ type: 'selectMicrophone', microphone: elements.microphoneSelect.value }));
elements.voice.addEventListener('click', () => vscode.postMessage({ type: 'toggleVoiceSession' }));
elements.microphone.addEventListener('click', () => vscode.postMessage({ type: 'toggleListening' }));
elements.expand.addEventListener('click', () => vscode.postMessage({ type: 'openEditor' }));
window.addEventListener('message', event => {
	const message = event.data;
	if (message.type === 'state') render(message.state);
	if (message.type === 'focusComposer') elements.composer.focus();
	if (message.type === 'transcript') reviewTranscript(message.text, message.submitAfterMs);
});
vscode.postMessage({ type: 'ready' });
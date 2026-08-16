import * as vscode from 'vscode';

export function getWebviewHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
	const nonce = crypto.randomUUID().replaceAll('-', '');
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.css'));

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src https://api.openai.com; media-src blob:;">
	<link rel="stylesheet" href="${styleUri}">
	<title>VoicePlus</title>
</head>
<body>
	<div class="app">
		<header class="toolbar">
			<div class="provider-switch" role="group" aria-label="Voice provider">
				<button id="providerLocal" type="button">Microsoft</button>
				<button id="providerOpenAi" type="button">OpenAI</button>
			</div>
			<select id="model" class="model" aria-label="Copilot language model"></select>
			<button id="microphone" class="icon-button microphone" type="button" aria-label="Start listening" title="Start listening">Mic</button>
			<button id="voice" class="voice-toggle" type="button" aria-label="Toggle voice session" title="Toggle voice session"></button>
			<button id="stopTask" class="icon-button stop-task" type="button" aria-label="Stop task" title="Stop task">■</button>
			<button id="expand" class="icon-button" type="button" aria-label="Open expanded chat" title="Open expanded chat">↗</button>
		</header>
		<div class="audio-settings">
			<label id="localVoiceSetting">Voice<select id="voiceSelect" aria-label="Microsoft speech voice"></select></label>
			<label>Input<select id="microphoneSelect" aria-label="Microphone input"></select></label>
		</div>
		<section id="openAiPanel" class="openai-panel" aria-label="OpenAI Realtime settings">
			<div class="openai-status-row">
				<span id="cloudStatus" class="cloud-status">Cloud audio</span>
				<span id="openAiUsage" class="usage"></span>
				<button id="configureOpenAi" class="secondary compact" type="button">Add API key</button>
			</div>
			<div class="openai-settings">
				<label>Model<select id="openAiModel" aria-label="OpenAI Realtime model"></select></label>
				<label>Voice<select id="openAiVoice" aria-label="OpenAI Realtime voice"></select></label>
				<label>Tone<select id="openAiTone" aria-label="OpenAI response tone"><option value="casual">Casual</option><option value="professional">Professional</option><option value="custom">Custom</option></select></label>
			</div>
			<div class="privacy-row">
				<div><strong>Shared with OpenAI</strong><div id="sharedContext" class="shared-context"></div></div>
				<div class="privacy-actions">
					<button id="grantOpenAiConsent" class="primary compact" type="button">Review access</button>
					<button id="removeOpenAiKey" class="icon-button" type="button" title="Remove OpenAI API key" aria-label="Remove OpenAI API key">×</button>
					<button id="revokeOpenAiAccess" class="secondary compact" type="button">Revoke</button>
				</div>
			</div>
		</section>
		<main id="messages" class="messages"></main>
		<div id="voiceState" class="voice-state" role="status"></div>
		<div class="composer-wrap">
			<div id="pendingAttachments" class="pending-attachments" aria-label="Pending workspace context"></div>
			<textarea id="composer" class="composer" aria-label="Message VoicePlus" placeholder="Ask about your code..."></textarea>
			<div class="actions">
				<div class="composer-tools">
					<button id="attach" class="icon-button" type="button" aria-label="Attach workspace context" title="Attach workspace context">+</button>
					<label class="auto-run"><input id="commandAutoApprove" type="checkbox"> Auto-run safe commands</label>
					<span id="status" class="status">Ready</span>
				</div>
				<button id="send" class="primary" type="button">Send</button>
			</div>
		</div>
	</div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
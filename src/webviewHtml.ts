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
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
	<link rel="stylesheet" href="${styleUri}">
	<title>VoicePlus</title>
</head>
<body>
	<div class="app">
		<header class="toolbar">
			<select id="model" class="model" aria-label="Language model"></select>
			<button id="microphone" class="icon-button microphone" type="button" aria-label="Start listening" title="Start listening">Mic</button>
			<button id="voice" class="voice-toggle" type="button" aria-label="Toggle voice session" title="Toggle voice session"></button>
			<button id="stopTask" class="icon-button stop-task" type="button" aria-label="Stop task" title="Stop task">■</button>
			<button id="expand" class="icon-button" type="button" aria-label="Open expanded chat" title="Open expanded chat">↗</button>
		</header>
		<div class="audio-settings">
			<label>Voice<select id="voiceSelect" aria-label="Speech voice"></select></label>
			<label>Input<select id="microphoneSelect" aria-label="Microphone input"></select></label>
		</div>
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
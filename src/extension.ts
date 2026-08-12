import * as vscode from 'vscode';
import { VoicePlusController } from './voicePlusControllerImpl';

export function activate(context: vscode.ExtensionContext) {
	const controller = new VoicePlusController(context);

	context.subscriptions.push(
		controller,
		vscode.window.registerWebviewViewProvider('voiceplus.chatView', controller),
		vscode.commands.registerCommand('voiceplus.openChat', () => controller.openEditor()),
		vscode.commands.registerCommand('voiceplus.toggleVoiceSession', () => controller.toggleVoiceSession()),
		vscode.commands.registerCommand('voiceplus.toggleListening', () => controller.toggleListening()),
		vscode.commands.registerCommand('voiceplus.stopResponse', () => controller.stopResponse()),
		vscode.commands.registerCommand('voiceplus.installSpeechModel', () => controller.installSpeechModel()),
		vscode.commands.registerCommand('voiceplus.selectVoice', () => controller.selectVoice()),
		vscode.commands.registerCommand('voiceplus.selectMicrophone', () => controller.selectMicrophone()),
		vscode.commands.registerCommand('voiceplus.attachContext', () => controller.attachContext()),
	);
}

export function deactivate() {}

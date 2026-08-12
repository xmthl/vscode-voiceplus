# VoicePlus

VoicePlus is a private, Windows-only VS Code extension for spoken conversations with Copilot models. Milestone 1 provides an independent chat UI, offline English transcription, concise spoken summaries, and automatic voice turn-taking.

## Requirements

- Windows 10 or 11
- VS Code 1.125 or newer
- GitHub Copilot access to VS Code language models
- A working Windows microphone and an installed Windows text-to-speech voice
- About 130 MB of free storage for the local speech model and runtime

VoicePlus does not send microphone audio to a speech service. Prompts and chat context are sent to the selected Copilot model under the user's existing Copilot access.

## Current Features

- Activity Bar chat and synchronized expanded editor view
- Automatic model selection with a Copilot model picker
- Streaming written responses with cancellation
- Animated, theme-aware voice-session switch
- Microphone button and configurable `Ctrl+Alt+V` listening shortcut
- Dynamic voice and microphone dropdowns populated from installed Windows devices
- Persisted selection through **VoicePlus: Select Voice** and **VoicePlus: Select Microphone**
- Explicit active-selection, active-file, and browsed text-file attachments
- Visible context labels on each message that shares workspace content
- Automatic context from the last focused active editor, including unsaved buffers
- Model-driven workspace file listing, exact-text search, and UTF-8 file reads in trusted workspaces
- Model-proposed file and folder changes with plain-language plans and expandable diffs
- Explicit Apply/Reject controls and conflict-aware one-click undo
- Separately approved commands in a visible VoicePlus terminal with captured output and exit codes
- Session-only auto-run for safe commands; pushes, elevation, destructive commands, and compound commands always require approval
- Stop Task control for model requests and running command batches
- Local English transcription using Sherpa-ONNX and Moonshine Base
- Silence-based turn completion and a two-second transcript review period
- Three-to-four-sentence spoken summaries through Windows speech synthesis
- Automatic listen, respond, speak, and listen turn-taking
- Speech interruption by pressing the microphone control or shortcut

Additional attachment types, instruction discovery, and multiple conversations remain in Milestone 2. The approved edit and terminal-action foundation from Milestone 3 is implemented. Its design is recorded in the source tree's technical specification.

## Run From Source

```powershell
npm install
npm run compile
```

Press `F5` in VS Code to open an Extension Development Host. Open VoicePlus from the Activity Bar.

The first voice session asks permission to download a pinned 111 MB English model. VoicePlus verifies its published SHA-256 digest before extracting it to VS Code extension storage.

## Test

```powershell
npm test
```

## Build A VSIX

```powershell
npx @vscode/vsce package
```

Install the resulting file using **Extensions: Install from VSIX...** or:

```powershell
code --install-extension .\voiceplus-0.0.1.vsix
```

## Privacy

- Audio is processed locally and never retained.
- Telemetry is not collected.
- Chat persistence is disabled by default.
- Milestone 2 will exclude ignored and credential-like files unless explicitly approved.

## Known Limitations

- Only local Windows workspaces are supported.
- The local model is downloaded from the pinned Sherpa-ONNX GitHub release on first use.
- Workspace context and coding-agent tools are not implemented in Milestone 1.
- The full response is plain text in the chat UI; rich Markdown rendering arrives with attachment and tool-result support.
- Explicit attachments currently support UTF-8 text up to 200 KB; folders, images, diagnostics, and terminal output are not implemented yet.
- Automatic workspace retrieval is read-only, requires Workspace Trust, excludes sensitive paths and generated/dependency folders, and limits files to 200 KB.
- Workspace changes and terminal commands require Workspace Trust and remain pending until approved. Safe-command auto-run resets when VS Code reloads.
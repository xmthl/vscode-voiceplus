# VoicePlus

VoicePlus is a private, Windows-only VS Code extension for spoken coding conversations. It supports local Microsoft speech with Copilot and optional OpenAI Realtime responses, alongside offline English transcription, automatic turn-taking, guarded workspace context, and user-approved coding actions.

## Requirements

- Windows 10 or 11
- VS Code 1.125 or newer
- GitHub Copilot access to VS Code language models
- A working Windows microphone and an installed Windows text-to-speech voice
- About 130 MB of free storage for the local speech model and runtime
- Optional: an OpenAI API Platform key with access to a supported Realtime model

In Microsoft mode, microphone audio is transcribed locally, prompts and context are sent through VS Code's selected Copilot model, and summaries use Windows speech. In OpenAI mode, microphone audio and the context listed in the UI are streamed directly to OpenAI; the Realtime model understands the original audio and generates the response and voice together. OpenAI transcription captions the user's message, while the written assistant response is the exact spoken transcript.

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
- Microsoft/Copilot and OpenAI Realtime provider switch
- OpenAI Realtime model, voice, casual, professional, and custom tone controls
- Exact OpenAI audio transcripts, output-only WebRTC playback, and natural interruption
- Persistent OpenAI voice sessions while browsing Explorer and opening other editor files
- Live filtered active-editor context updates for subsequent spoken turns
- Per-workspace OpenAI data-sharing consent with visible shared context
- Session cost estimates and a configurable spending cutoff
- Automatic Copilot and Microsoft speech fallback when Realtime is unavailable

## OpenAI Realtime Setup

1. Run **VoicePlus: Configure OpenAI Realtime** or select **OpenAI** in the provider switch.
2. Enter an OpenAI API Platform key. It is validated and stored only in VS Code Secret Storage.
3. Review the workspace context disclosure and allow access for that workspace. In active-editor mode, filtered context follows files as you open them.
4. Choose a Realtime model, voice, and tone in the VoicePlus view.

The extension host uses the permanent key only to mint a short-lived client secret. The webview receives that ephemeral credential and connects directly to OpenAI over WebRTC. Use **VoicePlus: Remove OpenAI API Key** to delete the key or **VoicePlus: Revoke OpenAI Workspace Access** to revoke consent and clear the in-memory conversation.

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

- Audio is processed locally in Microsoft mode. OpenAI mode streams microphone audio directly to OpenAI and does not persist it locally.
- Telemetry is not collected.
- Conversation history is held in memory and is not persisted.
- Automatic workspace retrieval excludes credential-like paths and generated or dependency folders.
- Hidden OpenAI sessions remain visible and stoppable from the VoicePlus status-bar item or `Ctrl+Alt+V`.
- OpenAI mode is disabled in untrusted workspaces and can be disabled machine-wide with `voiceplus.openai.enabled`.
- OpenAI API retention, residency, billing, and organization policies apply to content sent in OpenAI mode. API data is not used for training by default.
- The permanent OpenAI API key never enters webview state, logs, prompts, or workspace storage.

## Known Limitations

- Only local Windows workspaces are supported.
- OpenAI session costs are estimates based on reported token usage; OpenAI billing is authoritative.
- The local model is downloaded from the pinned Sherpa-ONNX GitHub release on first use.
- The full response is rendered as plain text in the chat UI.
- Explicit attachments currently support UTF-8 text up to 200 KB; folders, images, diagnostics, and terminal output are not implemented yet.
- VoicePlus currently has one in-memory conversation; named conversations and persisted history are not implemented yet.
- Personal instructions and instruction-file discovery are not wired into model prompts yet.
- Model capability checks, vision fallback, and context compaction are not implemented yet.
- Automatic workspace retrieval is read-only, requires Workspace Trust, excludes sensitive paths and generated/dependency folders, and limits files to 200 KB.
- Workspace changes and terminal commands require Workspace Trust and remain pending until approved. Safe-command auto-run resets when VS Code reloads.
# VoicePlus Development Quickstart

## Setup

```powershell
npm install
npm run compile
```

Press `F5` to launch an Extension Development Host, then open VoicePlus from the Activity Bar. The first voice session offers to download the pinned local English speech model.

## Development

- Run the default `watch` task to rebuild TypeScript and the extension bundle as files change.
- Set breakpoints in `src/extension.ts` or `src/voicePlusControllerImpl.ts` and inspect extension-host output in the debug console.
- Reload the Extension Development Host after changes that are not picked up automatically.

## Validation

```powershell
npm run compile
npm test
```

Tests live under `src/test` and use the VS Code Extension Test Runner.

## Package

```powershell
npx @vscode/vsce package
```

The production bundle is written to `dist` during packaging. Generated bundles, test output, dependencies, and VSIX files are excluded from Git.

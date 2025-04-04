# Build Status Watcher

This VS Code extension displays the build status from a file in the status bar.

- Dark gray: no build running
- Light gray: build running (with timer)
- Red: build failed
- Green: build succeeded

## Usage

Write a file in `/tmp` named `build-status-*` with one of the following contents:

- `success`
- `fail`
- `in-progress`

the rest of file is shown in tooltip

## Build & Package

```bash
npm install
npm run compile
npx vsce package
```

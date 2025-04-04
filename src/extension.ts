import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | undefined;
let timer: NodeJS.Timeout | undefined;
let buildStartTime: number | null = null;
let currentBuildStatus: string | null = null;
const STATUS_DIR = '/tmp';
const STATUS_PREFIX = 'build-status-';

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = 'Build: idle';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.background');
    statusBarItem.show();

    vscode.commands.registerCommand('extension.clearBuildStatus', () => {
        if (!currentBuildStatus)
            return;

        fs.unlink(currentBuildStatus, (err) => {
            if (err) {
                vscode.window.showErrorMessage(`Failed to clear build status: ${err.message}`);
            } else {
                currentBuildStatus = null;
            }
        });
    })

    const updateStatus = () => {
        fs.readdir(STATUS_DIR, (err, files) => {
            currentBuildStatus = null;
            if (err) return;

            // remove the rest?
            const mostRecentFile = files
                .filter(f => f.startsWith(STATUS_PREFIX))
                .map(f => path.join(STATUS_DIR, f))
                .filter(f => fs.statSync(f).isFile())
                .reduce((acc, f) => {
                    const stat = fs.statSync(f);
                    if (acc.mtimeMs < stat.mtimeMs) {
                        acc.file = f;
                        acc.mtimeMs = stat.mtimeMs;
                    }
                    return acc;
                }, {
                    file: '',
                    mtimeMs: -1
                });

            const fullPath = mostRecentFile.file;
            const statusFile = path.basename(mostRecentFile.file);
            const title = statusFile.substring(STATUS_PREFIX.length);

            fs.readFile(fullPath, 'utf8', (err, data) => {
                const stat = fs.statSync(fullPath);
                if (err) {
                    setStatus(title, 'idle', stat.mtime);
                    return;
                }
                currentBuildStatus = fullPath;
                setStatus(title, data.trim(), stat.mtime);
            });
        });
    };

    const buildTooltip = (title: string, state: string, lines ?: string[]) => {
        const tooltip = new vscode.MarkdownString()
            .appendMarkdown(`**Build: ${title}**\n\n`)
            .appendMarkdown(lines ? lines.join('\n')  + '\n\n' : '')
            .appendMarkdown('[Clean](command:extension.clearBuildStatus)');
            tooltip.isTrusted = true;
        return tooltip;
    }

    const setStatus = (title: string, state: string, mtime: Date) => {
        if (timer)
            clearInterval(timer);
        timer = undefined;

        const lines = state.split('\n');
        const status = lines[0];
        const text = lines.slice(1);

        switch (lines[0]) {
            case 'success':
                statusBarItem.text = `$(check) Build: ${title} success`;
                statusBarItem.color = new vscode.ThemeColor('statusBarItem.foreground');
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.background');
                statusBarItem.tooltip = buildTooltip(title, status, text);
                buildStartTime = null;
                break;

            case 'fail':
                statusBarItem.text = `$(error) Build: ${title} failed`;
                statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                statusBarItem.tooltip = buildTooltip(title, status, text);
                buildStartTime = null;
                break;

            case 'in-progress':
                if (!buildStartTime) buildStartTime = Date.now();
                statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                timer = setInterval(() => {
                    const duration = Math.floor((Date.now() - (buildStartTime || Date.now())) / 1000);
                    statusBarItem.text = `$(sync~spin) Build: ${title} in progress (${duration}s)`;
                }, 1000);
                statusBarItem.tooltip = buildTooltip(title, status, text);
                break;

            case 'idle':
                statusBarItem.text = '$(circle-large-outline) Build: idle';
                statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.background');
                statusBarItem.tooltip = buildTooltip(title, status, text);
                buildStartTime = null;
                break;

            default:
                statusBarItem.text = '$(circle-large-outline) Build: ${title} unknown';
                statusBarItem.color = new vscode.ThemeColor('statusBar.warningForeground');
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                statusBarItem.tooltip = buildTooltip(title, status, text);
                buildStartTime = null;
                break;
        }
    };

    // Setup file watcher
    try {
        watcher = fs.watch(STATUS_DIR, (eventType, filename) => {
            if (filename && filename.startsWith(STATUS_PREFIX)) {
                updateStatus();
            }
        });
    } catch (e) {
        console.error('Failed to watch directory', e);
    }

    updateStatus();
    context.subscriptions.push(statusBarItem);
}

export function deactivate() {
    if (watcher) {
        watcher.close();
    }
    if (timer) {
        clearInterval(timer);
    }
}

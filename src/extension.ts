import * as vscode from 'vscode';
import { CallHierarchyPlusProvider } from './hierarchyProvider';
import { HierarchyItem } from './models';

export function activate(context: vscode.ExtensionContext) {
    console.log('[CHP] Extension Activating...');
    
    const treeProvider = new CallHierarchyPlusProvider();
    vscode.window.registerTreeDataProvider('chpView', treeProvider);

    // Command: Refresh Tree View
    const refreshDisposable = vscode.commands.registerCommand('call-hierarchy-plus.refresh', () => {
        treeProvider.refresh();
    });

    // Command: Collapse All Nodes
    const collapseDisposable = vscode.commands.registerCommand('call-hierarchy-plus.collapseAll', () => {
        vscode.commands.executeCommand('workbench.actions.treeView.chpView.collapseAll');
    });

    // Command: Run Call Hierarchy Plus
    const runDisposable = vscode.commands.registerCommand('call-hierarchy-plus.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const doc = editor.document;
        const pos = editor.selection.active;
        
        try {
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy', doc.uri, pos
            );

            if (items && items.length > 0) {
                const root = createRootItem(items[0]);
                treeProvider.refresh(root);
                await vscode.commands.executeCommand('chpView.focus');
            } else {
                handleFallback(editor, treeProvider);
            }
        } catch (err) {
            console.error('[CHP] Activation Error:', err);
        }
    });

    context.subscriptions.push(refreshDisposable, collapseDisposable, runDisposable);
}

/**
 * Creates a formatted HierarchyItem from a built-in CallHierarchyItem.
 */
function createRootItem(item: vscode.CallHierarchyItem): HierarchyItem {
    const name = item.name.split('(')[0].trim();
    return new HierarchyItem(name, name, item.uri, item.selectionRange, 'root', item.detail, item);
}

/**
 * Fallback logic for when the built-in C/C++ engine fails to recognize a symbol.
 */
function handleFallback(editor: vscode.window.TextEditor, provider: CallHierarchyPlusProvider): void {
    const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
    if (wordRange) {
        const name = editor.document.getText(wordRange).split('(')[0].trim();
        const fallbackRoot = new HierarchyItem(name, name, editor.document.uri, wordRange, 'root', 'Fallback Symbol');
        provider.refresh(fallbackRoot);
        vscode.commands.executeCommand('chpView.focus');
    } else {
        vscode.window.showErrorMessage('Please place cursor on a valid function or pointer name.');
    }
}
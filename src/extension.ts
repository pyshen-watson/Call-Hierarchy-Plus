import * as vscode from 'vscode';
import { CallHierarchyPlusProvider } from './hierarchyProvider';
import { HierarchyItem } from './models';

export function activate(context: vscode.ExtensionContext) {
    console.log('--- CHP Extension is Activating ---');
    const treeProvider = new CallHierarchyPlusProvider();
    vscode.window.registerTreeDataProvider('chpView', treeProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('call-hierarchy-plus.refresh', () => {
            treeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('call-hierarchy-plus.collapseAll', () => {
            vscode.commands.executeCommand('workbench.actions.treeView.chpView.collapseAll');
        })
    );


    let runDisposable = vscode.commands.registerCommand('call-hierarchy-plus.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return};

        const doc = editor.document;
        const pos = editor.selection.active;
        const wordRange = doc.getWordRangeAtPosition(pos);
        const functionName = wordRange ? doc.getText(wordRange) : '';

        try {
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy',
                doc.uri,
                pos
            );

            if (items && items.length > 0) {
				const cleanName = items[0].name.split('(')[0].trim();
                const rootItem = new HierarchyItem(
                    cleanName,
                    cleanName,
                    items[0].uri,
                    items[0].selectionRange,
                    'root',
                    items[0].detail,
                    items[0]
                );
                treeProvider.refresh(rootItem);
                await vscode.commands.executeCommand('chpView.focus');
            } 
			else if (functionName) {
                console.log(`[CHP] Built-in hierarchy failed. Using fallback for ${functionName}`);
				const cleanName = functionName.split('(')[0].trim();
                const fallbackRoot = new HierarchyItem(
                    cleanName,      // label
                    cleanName,      // symbolName
                    doc.uri,
                    wordRange!,
                    'root',
                    'Fallback (No built-in data)'
                );
                treeProvider.refresh(fallbackRoot);
                await vscode.commands.executeCommand('chpView.focus');
            } 
			else {
                vscode.window.showErrorMessage('Please place cursor on a function name.');
            }
        } 
		catch (err) {
            console.error('CHP Command Error:', err);
        }
    });

    context.subscriptions.push(runDisposable);
}
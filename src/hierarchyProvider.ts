import * as vscode from 'vscode';
import { HierarchyItem } from './models';
import { findPointerAssignments, findPointerCalls } from './searchEngine';

export class CallHierarchyPlusProvider implements vscode.TreeDataProvider<HierarchyItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<HierarchyItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private root: HierarchyItem | null = null;

    refresh(newRoot: HierarchyItem): void {
        this.root = newRoot;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HierarchyItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: HierarchyItem): Promise<HierarchyItem[]> {
        if (!element) {
            return this.root ? [this.root] : [];
        }

        const results: HierarchyItem[] = [];

        // CASE 1: Node is a Function (Root or standard Call)
        if (element.type === 'root' || element.type === 'call') {
            // A. Get standard direct callers
            if (element.rawCallItem) {
                const incoming = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                    'vscode.provideIncomingCalls',
                    element.rawCallItem
                );
                incoming?.forEach(call => {
                    results.push(new HierarchyItem(
                        call.from.name,
                        call.from.name, // symbolName
                        call.from.uri,
                        call.from.selectionRange,
                        'call',
                        call.from.detail,
                        call.from
                    ));
                });
            }

            // B. Get our custom pointer assignments
            const assignments = await findPointerAssignments(element.symbolName, element.uri, element.range.start);
            results.push(...assignments);
        }

        else if (element.type === 'assignment') {
            console.log(`[CHP] Traversing pointer caller for: ${element.symbolName}`);
            const pointerCallers = await findPointerCalls(
                element.symbolName, 
                element.uri, 
                element.range.start
            );
            results.push(...pointerCallers);
        }
        return results;
    }
}
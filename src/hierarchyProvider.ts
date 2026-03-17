import * as vscode from 'vscode';
import { HierarchyItem } from './models';
import { findPointerAssignments } from './searchEngine';

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

        // --- SOURCE 1: Standard Incoming Calls ---
        if (element.rawCallItem) {
            try {
                const incomingCalls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                    'vscode.provideIncomingCalls',
                    element.rawCallItem
                );
                if (incomingCalls) {
                    incomingCalls.forEach(call => {
                        results.push(new HierarchyItem(
                            call.from.name,
                            call.from.uri,
                            call.from.selectionRange,
                            'call',
                            call.from.detail,
                            call.from
                        ));
                    });
                }
            } catch (err) {
                console.error('Error fetching standard calls:', err);
            }
        }

        // --- SOURCE 2: Custom Pointer Assignments ---
        const assignments = await findPointerAssignments(
            element.label, 
            element.uri, 
            element.range.start
        );
        results.push(...assignments);

        return results;
    }
}
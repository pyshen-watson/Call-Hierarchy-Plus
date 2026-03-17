import * as vscode from 'vscode';
import { HierarchyItem } from './models';
import { findPointerAssignments, findPointerCalls } from './searchEngine';

export class CallHierarchyPlusProvider implements vscode.TreeDataProvider<HierarchyItem> {

    private _onDidChangeTreeData = new vscode.EventEmitter<HierarchyItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private root: HierarchyItem | null = null;

    refresh(newRoot?: HierarchyItem): void {
        if (newRoot) {
            this.root = newRoot;
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HierarchyItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: HierarchyItem): Promise<HierarchyItem[]> {
        if (!element) return this.root ? [this.root] : [];

        if (element.type === 'root' || element.type === 'call') {
            return this.getFunctionChildren(element);
        } else if (element.type === 'assignment') {
            return this.getAssignmentChildren(element);
        }

        return [];
    }

    private async getFunctionChildren(element: HierarchyItem): Promise<HierarchyItem[]> {
        const results: HierarchyItem[] = [];

        // 1. Process standard incoming calls
        if (element.rawCallItem) {
            const incoming = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                'vscode.provideIncomingCalls',
                element.rawCallItem
            );
            incoming?.forEach(call => {
                const name = call.from.name.split('(')[0];
                const exactCallRange = (call.fromRanges && call.fromRanges.length > 0) 
                    ? call.fromRanges[0] 
                    : call.from.selectionRange;

                results.push(new HierarchyItem(
                    name,
                    name,
                    call.from.uri,
                    exactCallRange,
                    'call',
                    call.from.detail,
                    call.from
                ));
            });
        }

        // 2. Process pointer assignments (The "Bridge" registration)
        const assignments = await findPointerAssignments(element.symbolName, element.uri, element.range.start);
        results.push(...assignments);

        return results;
    }

    private async getAssignmentChildren(element: HierarchyItem): Promise<HierarchyItem[]> {
        // Resolve where the pointer variable is actually executed
        return await findPointerCalls(element.symbolName, element.uri, element.range.start);
    }
}
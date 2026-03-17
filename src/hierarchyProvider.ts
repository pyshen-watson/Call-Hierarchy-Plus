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
        if (!element) return this.root ? [this.root] : [];

        const results: HierarchyItem[] = [];

        // --- 分流邏輯 ---

        // A. 如果是 Function 類型 (Root 或一般的函式呼叫者)
        if (element.type === 'root' || element.type === 'call') {
            // 1. 找標準的 C/C++ 呼叫者 (Incoming Calls)
            if (element.rawCallItem) {
                const incoming = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
                    'vscode.provideIncomingCalls',
                    element.rawCallItem
                );
                incoming?.forEach(call => {
                    results.push(new HierarchyItem(
                        call.from.name.split('(')[0],
                        call.from.name.split('(')[0],
                        call.from.uri,
                        call.from.selectionRange,
                        'call',
                        call.from.detail,
                        call.from
                    ));
                });
            }

            // 2. 找這個函式被 Assign 給誰 (findPointerAssignments)
            // 這是你的需求核心：找出 func = ptr 的地方
            const assignments = await findPointerAssignments(element.symbolName, element.uri, element.range.start);
            results.push(...assignments);
        } 
        
        // B. 如果是 Pointer 類型 (Bridge 橋樑)
        else if (element.type === 'assignment') {
            // 重要：這時候不應該再找 Assignments，而是要找這個指標被誰呼叫了！
            // 搜尋目標是 g_bt_callback(...)
            const calls = await findPointerCalls(element.symbolName, element.uri, element.range.start);
            results.push(...calls);
        }

        return results;
    }
}
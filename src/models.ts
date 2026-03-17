import * as vscode from 'vscode';

export type HierarchyType = 'root' | 'call' | 'assignment';

export class HierarchyItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly symbolName: string,
        public readonly uri: vscode.Uri,
        public readonly range: vscode.Range,
        public readonly type: HierarchyType,
        public readonly descriptionText?: string,
        public readonly rawCallItem?: vscode.CallHierarchyItem 
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.resourceUri = uri;
        this.description = descriptionText || '';
        // this.tooltip = `[${type.toUpperCase()}] ${symbolName}`;
        
        // Visual distinction between direct calls and pointer assignments
        if (type === 'root') {
            this.iconPath = new vscode.ThemeIcon('symbol-function'); // 根節點：藍色函數
        } else if (type === 'call') {
            this.iconPath = new vscode.ThemeIcon('call-incoming');   // 直接呼叫：綠色箭頭
        } else if (type === 'assignment') {
            this.iconPath = new vscode.ThemeIcon('link-external');   // 指標賦值：橘色連結
        }

        this.command = {
            command: 'vscode.open',
            title: 'Open Location',
            arguments: [
                uri, 
                { 
                    selection: range, // 這會選中整行或我們計算的精確範圍
                    preserveFocus: false 
                }
            ]
        };
    }
}
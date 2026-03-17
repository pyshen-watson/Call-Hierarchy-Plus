import * as vscode from 'vscode';

export type HierarchyType = 'root' | 'call' | 'assignment';

export class HierarchyItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly uri: vscode.Uri,
        public readonly range: vscode.Range,
        public readonly type: HierarchyType,
        public readonly descriptionText?: string,
        // Store the original CallHierarchyItem for nested lookups
        public readonly rawCallItem?: vscode.CallHierarchyItem 
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);

        this.resourceUri = uri;
        this.description = descriptionText || '';
        this.tooltip = `[${type.toUpperCase()}] ${label}`;
        
        // Visual distinction between direct calls and pointer assignments
        if (type === 'root') {
            this.iconPath = new vscode.ThemeIcon('symbol-function');
            this.contextValue = 'root';
        } else if (type === 'call') {
            this.iconPath = new vscode.ThemeIcon('call-incoming');
            this.contextValue = 'call';
        } else {
            this.iconPath = new vscode.ThemeIcon('link-external'); // Assignment icon
            this.contextValue = 'assignment';
        }

        // Clicking the item opens the file at the specific line
        this.command = {
            command: 'vscode.open',
            title: 'Open Location',
            arguments: [uri, { selection: range }]
        };
    }
}
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
        
        this.setupVisuals(type);
        this.setupNavigationCommand(uri, range);
    }

    private setupVisuals(type: HierarchyType): void {
        switch (type) {
            case 'root':
                this.iconPath = new vscode.ThemeIcon('symbol-function');
                break;
            case 'call':
                this.iconPath = new vscode.ThemeIcon('call-incoming');
                break;
            case 'assignment':
                this.iconPath = new vscode.ThemeIcon('link-external');
                break;
        }
    }

    private setupNavigationCommand(uri: vscode.Uri, range: vscode.Range): void {
        this.command = {
            command: 'vscode.open',
            title: 'Open Location',
            arguments: [
                uri, 
                { 
                    selection: range,
                    preserveFocus: false 
                }
            ]
        };
    }
}
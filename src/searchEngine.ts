import * as vscode from 'vscode';
import { HierarchyItem } from './models';

// src/searchEngine.ts

export async function findPointerAssignments(functionName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    const assignments: HierarchyItem[] = [];
    const cleanName = functionName.split('(')[0].trim();
    const references = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', uri, position);

    if (!references) return [];

    for (const loc of references) {
        const doc = await vscode.workspace.openTextDocument(loc.uri);
        const lineText = doc.lineAt(loc.range.start.line).text;
        
        // 改進 Regex 以提取左式 (LHS)，同時考慮結構體成員如 .on_rx
        const assignmentRegex = new RegExp(`(?:^|[\\s,])([\\w.]+)\\s*[:=]\\s*&?\\s*${cleanName}(?![a-zA-Z0-9_])`);
        const match = lineText.match(assignmentRegex);

        if (match) {
            const lhs = match[1];
            // 重點：精計算 LHS 在該行中的字元偏移量
            const charOffset = lineText.indexOf(lhs);
            const preciseRange = new vscode.Range(
                loc.range.start.line, charOffset,
                loc.range.start.line, charOffset + lhs.length
            );

            assignments.push(new HierarchyItem(
                lhs,
                lhs,
                loc.uri,
                preciseRange, // 存入精確的變數位置
                'assignment',
                `(Assign) ${lineText.trim()}`
            ));
        }
    }
    return assignments;
}

export async function findPointerCalls(symbolName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    const callers: HierarchyItem[] = [];
    
    // 1. 判斷是否為成員 (以 . 開頭)
    const isMember = symbolName.startsWith('.');
    const cleanSymbol = isMember ? symbolName.substring(1) : symbolName;
    
    const doc = await vscode.workspace.openTextDocument(uri);
    const lineText = doc.lineAt(position.line).text;
    
    // 2. 精確定位：如果是成員則跳過 "."，如果是全域變數則保持原位
    let symbolOffset = lineText.indexOf(symbolName);
    if (isMember && symbolOffset !== -1) {
        symbolOffset += 1; 
    }
    
    const precisePos = symbolOffset !== -1 ? new vscode.Position(position.line, symbolOffset) : position;

    console.log(`[CHP Bridge] Searching calls for: ${cleanSymbol} at ${precisePos.line}:${precisePos.character}`);

    const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider', uri, precisePos
    );

    if (!references || references.length === 0) return [];

    for (const loc of references) {
        const refDoc = await vscode.workspace.openTextDocument(loc.uri);
        const refLine = refDoc.lineAt(loc.range.start.line).text.trim();

        /**
         * 3. 終極 Regex：
         * (?:\\.|->|\\b) 
         * 代表：前面可以是 "." 或 "->" 或 "單字邊界 (Word Boundary)"
         * 這樣就能同時匹配 realtek_ops.on_rx( 或是 g_bt_callback(
         */
        const callRegex = new RegExp(`(?:\\.|->|\\b)${cleanSymbol}\\s*\\(`);

        if (callRegex.test(refLine)) {
            const containerItem = await getEnclosingFunction(loc.uri, loc.range.start);
            if (containerItem) {
                callers.push(new HierarchyItem(
                    containerItem.name.split('(')[0],
                    containerItem.name.split('(')[0],
                    loc.uri,
                    containerItem.selectionRange,
                    'call',
                    `(Call) ${refLine}`,
                    containerItem
                ));
            }
        }
    }
    return callers;
}


// 輔助函式：尋找包裹該位置的函式
async function getEnclosingFunction(uri: vscode.Uri, position: vscode.Position): Promise<vscode.CallHierarchyItem | null> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', uri
    );
    if (!symbols) return null;

    const findInList = (list: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
        for (const s of list) {
            if (s.range.contains(position)) {
                const child = findInList(s.children || []);
                return child || s;
            }
        }
        return null;
    };

    const target = findInList(symbols);
    if (target) {
        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            'vscode.prepareCallHierarchy', uri, target.selectionRange.start
        );
        return items && items.length > 0 ? items[0] : null;
    }
    return null;
}

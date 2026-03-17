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

// src/searchEngine.ts 中的 findPointerCalls

export async function findPointerCalls(symbolName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    const callers: HierarchyItem[] = [];
    const cleanSymbol = symbolName.startsWith('.') ? symbolName.substring(1) : symbolName;
    
    // 直接使用傳入的精確位置 (已經在 findPointerAssignments 中算好了)
    console.log(`[CHP Bridge] Precisely searching for: ${cleanSymbol} at line ${position.line + 1}`);

    const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider', 
        uri, 
        position 
    );

    if (!references || references.length === 0) {
        console.log(`[CHP Bridge] Still 0 references. Trying fallback: document search...`);
        // 這裡可以加入一個簡單的字串搜尋作為備案，但我們先解決 API 座標問題
        return [];
    }

    for (const loc of references) {
        const doc = await vscode.workspace.openTextDocument(loc.uri);
        const lineText = doc.lineAt(loc.range.start.line).text.trim();

        // 檢查是否為執行語句: symbolName(...)
        const callRegex = new RegExp(`\\b${cleanSymbol}\\s*\\(`);
        if (callRegex.test(lineText)) {
            const containerItem = await getEnclosingFunction(loc.uri, loc.range.start);
            if (containerItem) {
                callers.push(new HierarchyItem(
                    containerItem.name.split('(')[0],
                    containerItem.name.split('(')[0],
                    loc.uri,
                    containerItem.selectionRange,
                    'call',
                    `(Ptr Call) ${lineText}`,
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

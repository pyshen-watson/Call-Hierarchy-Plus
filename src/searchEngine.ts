import * as vscode from 'vscode';
import { HierarchyItem } from './models';

/**
 * Utility to clean function names from C-style parameters or brackets.
 */
function cleanName(name: string): string {
    return name.split('(')[0].trim();
}

/**
 * 從原本的 reference 位置往上回溯，精準定位 LHS 變數在文件中的真實 Range
 */
function getExactLhsRange(document: vscode.TextDocument, lhs: string, refPos: vscode.Position): vscode.Range {
    const startLine = Math.max(0, refPos.line - 5);
    
    // 從等號右邊所在的行開始往上掃描，尋找 lhs 字串的精確位置
    for (let line = refPos.line; line >= startLine; line--) {
        const lineText = document.lineAt(line).text;
        const charIndex = lineText.indexOf(lhs);
        
        if (charIndex !== -1) {
            // 找到了！回傳精確的起始與結束位置
            return new vscode.Range(line, charIndex, line, charIndex + lhs.length);
        }
    }
    
    // 萬一真的找不到 (理論上不會發生)，Fallback 回原本的起始位置
    return new vscode.Range(refPos.line, 0, refPos.line, lhs.length);
}

/**
 * 透過上下文視窗反向解析 LHS (指標名稱)
 */
function extractLhsFromContext(document: vscode.TextDocument, refPos: vscode.Position): string | null {
    // 1. 往前抓取 5 行作為上下文，解決跨行宣告問題
    const startLine = Math.max(0, refPos.line - 5);
    const range = new vscode.Range(startLine, 0, refPos.line, refPos.character);
    let textBlock = document.getText(range);

    // 2. 壓平字串：清除換行符號與多餘空白，消滅多行造成的斷層
    textBlock = textBlock.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

    // 3. 定位等號
    const eqIndex = textBlock.lastIndexOf('=');
    if (eqIndex === -1) return null;

    const rightSide = textBlock.substring(eqIndex + 1);
    if (!/^[\s&]*(?:\([^)]+\)[\s&]*)?$/.test(rightSide)) {
        return null; // 這是別人的等號，直接忽略！
    }

    const leftSide = textBlock.substring(0, eqIndex).trim();

    // 4a. 處理片段特徵：C 語言複雜函數指標
    // 特徵：等號左邊最後一個字元是 ')'，例如 void (*fp)(int, int)
    if (leftSide.endsWith(')')) {
        // 這裡只針對已經確認是函數宣告的局部字串做輕量正則萃取
        const match = leftSide.match(/\(\s*\*\s*([a-zA-Z0-9_]+)\s*\)\s*\([^)]*\)$/);
        if (match) return match[1];
    }

    // 4b. 處理片段特徵：一般賦值或結構體初始化
    // 特徵：結尾是變數名稱，例如 ptr 或 ops.ptr
    const words = leftSide.split(/[\s,({]+/); // 避開前面的型別或關鍵字
    const lastWord = words[words.length - 1];
    
    // 過濾掉指標的 '&' 或 '*' 符號
    const cleanWord = lastWord.replace(/[&*]/g, '');
    if (/^[a-zA-Z0-9_.]+$/.test(cleanWord)) {
        return cleanWord;
    }

    return null;
}

export async function findPointerAssignments(functionName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    console.log(`[CHP SearchEngine] 🚀 執行 findPointerAssignments`);
    console.log(`  - 目標函式: ${functionName}`);
    console.log(`  - 搜尋起點 (Line): ${position.line}, (Char): ${position.character}`);

    const assignments: HierarchyItem[] = [];
    const target = cleanName(functionName);
    
    const references = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', uri, position);
    if (!references) return [];

    for (const loc of references) {
        const doc = await vscode.workspace.openTextDocument(loc.uri);
        
        // 使用上下文解析法萃取 LHS
        const lhs = extractLhsFromContext(doc, loc.range.start);

        if (lhs) {
            // 替換這裡：使用精準定位取得真實的 Range
            const exactRange = getExactLhsRange(doc, lhs, loc.range.start);

            assignments.push(new HierarchyItem(
                lhs,
                lhs,
                loc.uri,
                exactRange, // 傳入修正後的精確 Range
                'assignment',
                `(Assign) ${lhs} = ${target}`
            ));
        }
    }
    return assignments;
}

export async function findPointerCalls(symbolName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    const callers: HierarchyItem[] = [];
    const isMember = symbolName.startsWith('.');
    const targetSymbol = isMember ? symbolName.substring(1) : symbolName;
    
    const doc = await vscode.workspace.openTextDocument(uri);
    const lineText = doc.lineAt(position.line).text;
    
    // Shift position forward by 1 if it's a member to skip the '.' for IntelliSense accuracy
    const symbolOffset = lineText.indexOf(symbolName);
    const searchPos = (isMember && symbolOffset !== -1) 
        ? new vscode.Position(position.line, symbolOffset + 1) 
        : position;

    console.log(`[CHP:Bridge] Searching pointer calls for: ${targetSymbol}`);

    const references = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', uri, searchPos);
    if (!references) return [];

    const callRegex = new RegExp(`(?:\\.|->|\\b)${targetSymbol}\\s*\\(`);

    for (const loc of references) {
        const refDoc = await vscode.workspace.openTextDocument(loc.uri);
        const refLine = refDoc.lineAt(loc.range.start.line).text.trim();

        if (callRegex.test(refLine)) {
            const containerItem = await getEnclosingFunction(loc.uri, loc.range.start);
            if (containerItem) {
                callers.push(new HierarchyItem(
                    cleanName(containerItem.name),
                    cleanName(containerItem.name),
                    loc.uri,
                    loc.range,
                    'call',
                    `(Ptr Call) ${refLine}`,
                    containerItem
                ));
            }
        }
    }
    return callers;
}

async function getEnclosingFunction(uri: vscode.Uri, position: vscode.Position): Promise<vscode.CallHierarchyItem | null> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
    if (!symbols) return null;

    const findContainer = (list: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
        for (const s of list) {
            if (s.range.contains(position)) {
                return findInChildren(s) || s;
            }
        }
        return null;
    };

    const findInChildren = (parent: vscode.DocumentSymbol): vscode.DocumentSymbol | null => {
        if (!parent.children) return null;
        for (const child of parent.children) {
            if (child.range.contains(position)) {
                return findInChildren(child) || child;
            }
        }
        return null;
    };

    const target = findContainer(symbols);
    if (target) {
        const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>('vscode.prepareCallHierarchy', uri, target.selectionRange.start);
        return items && items.length > 0 ? items[0] : null;
    }
    return null;
}
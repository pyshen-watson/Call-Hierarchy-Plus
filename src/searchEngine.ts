import * as vscode from 'vscode';
import { HierarchyItem } from './models';

/**
 * Utility to clean function names from C-style parameters or brackets.
 */
function cleanName(name: string): string {
    return name.split('(')[0].trim();
}

/**
 * Calculates a precise range for a symbol within a line of text.
 */
function getPreciseSymbolRange(lineText: string, symbol: string, lineNumber: number): vscode.Range {
    const charOffset = lineText.indexOf(symbol);
    const startChar = charOffset !== -1 ? charOffset : 0;
    return new vscode.Range(lineNumber, startChar, lineNumber, startChar + symbol.length);
}

export async function findPointerAssignments(functionName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    const assignments: HierarchyItem[] = [];
    const target = cleanName(functionName);
    
    const references = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', uri, position);
    if (!references) return [];

    for (const loc of references) {
        const doc = await vscode.workspace.openTextDocument(loc.uri);
        const lineText = doc.lineAt(loc.range.start.line).text;
        
        // Matches "symbol = target" or ".member = target"
        const assignmentRegex = new RegExp(`(?:^|[\\s,])([\\w.]+)\\s*[:=]\\s*&?\\s*${target}(?![a-zA-Z0-9_])`);
        const match = lineText.match(assignmentRegex);

        if (match) {
            const lhs = match[1];
            const preciseRange = getPreciseSymbolRange(lineText, lhs, loc.range.start.line);

            assignments.push(new HierarchyItem(
                lhs,
                lhs,
                loc.uri,
                preciseRange,
                'assignment',
                `(Assign) ${lineText.trim()}`
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
                    containerItem.selectionRange,
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
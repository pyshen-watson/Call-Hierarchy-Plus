import * as vscode from 'vscode';
import { HierarchyItem } from './models';

/**
 * Utility to clean function names from C-style parameters or brackets.
 */
function cleanName(name: string): string {
    return name.split('(')[0].trim();
}

/**
 * Finds the exact range of the LHS variable by searching upwards from the reference position.
 */
function getExactLhsRange(document: vscode.TextDocument, lhs: string, refPos: vscode.Position): vscode.Range {
    const startLine = Math.max(0, refPos.line - 5);

    // Add word boundary to prevent matching prefixes of RHS variables
    const regex = new RegExp(`\\b${lhs}\\b`);
    
    for (let line = refPos.line; line >= startLine; line--) {
        const lineText = document.lineAt(line).text;
        const match = lineText.match(regex);
        
        if (match && match.index !== undefined) {
            return new vscode.Range(line, match.index, line, match.index + lhs.length);
        }
    }
    return new vscode.Range(refPos.line, 0, refPos.line, lhs.length);
}

/**
 * Extracts LHS from context window to handle multi-line declarations.
 */
function extractLhsFromContext(document: vscode.TextDocument, refPos: vscode.Position): string | null {
    // 1. Fetch up to 5 lines of context
    const startLine = Math.max(0, refPos.line - 5);
    const range = new vscode.Range(startLine, 0, refPos.line, refPos.character);
    let textBlock = document.getText(range);

    // 2. Flatten string to handle multi-line gaps
    textBlock = textBlock.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

    // 3. Locate the assignment operator
    const eqIndex = textBlock.lastIndexOf('=');
    if (eqIndex === -1) return null;

    // Ensure the right side does not belong to another statement
    const rightSide = textBlock.substring(eqIndex + 1);
    if (!/^[\s&]*(?:\([^)]+\)[\s&]*)?$/.test(rightSide)) {
        return null; 
    }

    const leftSide = textBlock.substring(0, eqIndex).trim();

    // 4a. Handle complex C function pointers (e.g., void (*fp)(int, int))
    if (leftSide.endsWith(')')) {
        const match = leftSide.match(/\(\s*\*\s*([a-zA-Z0-9_]+)\s*\)\s*\([^)]*\)$/);
        if (match) return match[1];
    }

    // 4b. Handle standard assignments or struct initialization
    const words = leftSide.split(/[\s,({]+/); 
    const lastWord = words[words.length - 1];
    
    const cleanWord = lastWord.replace(/[&*]/g, '');
    if (/^[a-zA-Z0-9_.]+$/.test(cleanWord)) {
        return cleanWord;
    }

    return null;
}

export async function findPointerAssignments(functionName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    const assignments: HierarchyItem[] = [];
    const target = cleanName(functionName);
    
    const references = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', uri, position);
    if (!references) return [];

    for (const loc of references) {
        const doc = await vscode.workspace.openTextDocument(loc.uri);
        const lhs = extractLhsFromContext(doc, loc.range.start);

        if (lhs) {
            const exactRange = getExactLhsRange(doc, lhs, loc.range.start);

            assignments.push(new HierarchyItem(
                lhs,
                lhs,
                loc.uri,
                exactRange, 
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
    
    // Ensure search origin is an independent word
    const exactWordRegex = new RegExp(`\\b${targetSymbol}\\b`);
    const match = lineText.match(exactWordRegex);
    
    let searchPos = position;
    if (match && match.index !== undefined) {
        searchPos = new vscode.Position(position.line, match.index + (isMember ? 1 : 0));
    }

    const references = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', uri, searchPos);
    if (!references) return [];

    const callRegex = new RegExp(`^(?:\\.|->)?${targetSymbol}\\s*(?:\\)\\s*)?\\(`);

    for (const loc of references) {
            const refDoc = await vscode.workspace.openTextDocument(loc.uri);
            
        // Context window of 3 lines to handle multi-line arguments
            const endLine = Math.min(refDoc.lineCount - 1, loc.range.start.line + 3);
            const contextRange = new vscode.Range(loc.range.start, new vscode.Position(endLine, 1000));
            let contextText = refDoc.getText(contextRange);
            
            contextText = contextText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

        if (callRegex.test(contextText)) {
                const containerItem = await getEnclosingFunction(loc.uri, loc.range.start);
                if (containerItem) {
                    const displayLine = refDoc.lineAt(loc.range.start.line).text.trim();
                    callers.push(new HierarchyItem(
                        cleanName(containerItem.name),
                        cleanName(containerItem.name),
                        loc.uri,
                        loc.range,
                        'call',
                        `(Ptr Call) ${displayLine.substring(0, 60)}...`,
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
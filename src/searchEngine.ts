import * as vscode from 'vscode';
import { HierarchyItem } from './models';

export async function findPointerAssignments(functionName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    const assignments: HierarchyItem[] = [];
    const cleanName = functionName.split('(')[0].trim();
    console.log(`[CHP Search] Searching assignments for: ${cleanName}`);

    const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        position
    );

    if (!references) {
        console.log(`[CHP Search] No references returned from VS Code engine.`);
        return [];
    }

    console.log(`[CHP Search] Found ${references.length} total references. Filtering...`);

    for (const loc of references) {
        const doc = await vscode.workspace.openTextDocument(loc.uri);
        const lineText = doc.lineAt(loc.range.start.line).text.trim();

        // Updated Regex: More flexible with spaces and includes address operator (&)
        const assignmentRegex = new RegExp(`(?:^|[\\s,])([\\w.]+)\\s*[:=]\\s*&?\\s*${cleanName}(?![a-zA-Z0-9_])`);
        const match = lineText.match(assignmentRegex);

        if (match) {
            const lhs = match[1]; // The captured variable name
            assignments.push(new HierarchyItem(
                lhs,             // Label: the variable name
                lhs,             // New Search Target: the variable name
                loc.uri,
                loc.range,
                'assignment',
                `(Assign) ${lineText}`
            ));
        } 
        else {
            console.log(`[CHP Search] SKIP: ${lineText}`);
        }
    }

    return assignments;
}

export async function findPointerCalls(symbolName: string, uri: vscode.Uri, position: vscode.Position): Promise<HierarchyItem[]> {
    const callers: HierarchyItem[] = [];
    
    // Clean up the symbol name (e.g., remove leading dot if it's a struct member like .on_rx)
    const cleanSymbol = symbolName.startsWith('.') ? symbolName.substring(1) : symbolName;
    
    const doc = await vscode.workspace.openTextDocument(uri);
    const lineText = doc.lineAt(position.line).text;
    const symbolOffset = lineText.indexOf(cleanSymbol);
    const precisePosition = (symbolOffset !== -1) ? new vscode.Position(position.line, symbolOffset) : position;

    console.log(`[CHP Bridge] Searching calls for: "${cleanSymbol}" at ${precisePosition.line}:${precisePosition.character}`);

    const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        uri,
        precisePosition
    );

    if (!references || references.length === 0) {
        console.log(`[CHP Bridge] No references found for pointer "${cleanSymbol}".`);
        return [];
    }

    console.log(`[CHP Bridge] Found ${references.length} references for "${cleanSymbol}". Analyzing lines...`);

    for (const loc of references) {
        const doc = await vscode.workspace.openTextDocument(loc.uri);
        const lineText = doc.lineAt(loc.range.start.line).text.trim();

        /**
         * Enhanced Regex for Pointer Calls:
         * 1. \\b${cleanSymbol} : Match the pointer name
         * 2. \\s*\\( : Followed by an opening parenthesis
         * This captures: g_bt_callback(500) or g_bt_callback  (500)
         */
        const callRegex = new RegExp(`\\b${cleanSymbol}\\s*\\(`);

        if (callRegex.test(lineText)) {
            console.log(`[CHP Bridge] MATCHED CALL: ${lineText} at line ${loc.range.start.line + 1}`);
            
            // Try to find the function name containing this call
            let containerLabel = `Line ${loc.range.start.line + 1}`;
            try {
                const containerItems = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                    'vscode.prepareCallHierarchy',
                    loc.uri,
                    loc.range.start
                );
                if (containerItems && containerItems.length > 0) {
                    containerLabel = containerItems[0].name;
                }
            } catch (e) {
                // Fallback to line number if container search fails
            }

            callers.push(new HierarchyItem(
                containerLabel,
                cleanSymbol,
                loc.uri,
                loc.range,
                'call',
                `(Ptr Call) ${lineText}`
            ));
        } else {
            console.log(`[CHP Bridge] SKIP (not a call): ${lineText}`);
        }
    }

    console.log(`[CHP Bridge] Finished. Found ${callers.length} pointer callers.`);
    return callers;
}
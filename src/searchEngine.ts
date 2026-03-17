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
        const assignmentRegex = new RegExp(`(=|:)\\s*&?\\s*${cleanName}(?![a-zA-Z0-9_])`);

        if (assignmentRegex.test(lineText)) {
            console.log(`[CHP Search] Match found at line ${loc.range.start.line + 1}: ${lineText}`);
            assignments.push(new HierarchyItem(
                cleanName,
                loc.uri,
                loc.range,
                'assignment',
                `(Assign) ${lineText}`
            ));
        } else {
            console.log(`[CHP Search] SKIP: ${lineText}`);
        }
    }

    return assignments;
}
# Call Hierarchy Plus (CHP)

Call Hierarchy Plus is an enhanced Call Hierarchy extension for VS Code, specifically designed for C/C++ developers working on complex firmware (such as SoC development). It bridges the gap between direct function calls and indirect pointer assignments/callbacks.

## 📌 Features

The native VS Code Call Hierarchy often breaks when it encounters function pointers. CHP solves this by establishing a complete logic chain: **Function Definition ➔ Pointer Assignment ➔ Pointer Invocation**.

* **Function Pointer Tracking**: Seamlessly tracks through global variables, struct initializations, and local variables.
* **Complex Declarations**: Supports cross-line complex declarations (e.g., `void (*fp)(int) = target`).
* **Struct Member Invocations**: Precisely parses and tracks struct member calls like `ops.on_rx(data)`.
* **Deep Context Parsing**: Uses a multiline context window to accurately identify assignments even when arguments span multiple lines.

## 🚀 Usage

1.  Place your cursor on a function or function pointer in a C/C++ file.
2.  Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on macOS) to run Call Hierarchy Plus.
3.  The **Call Hierarchy Plus** view will open in the sidebar, displaying the complete call chain.
4.  Click on any node to navigate directly to the exact line of the function call or assignment.

## 🛠️ Requirements

* This extension is designed to work with C and C++ projects.
* It relies on the built-in C/C++ language features of VS Code (ensure you have the official Microsoft C/C++ extension installed and configured).

## 📝 Release Notes

### 1.0.0

* Initial release!
* Support for tracing global, local, and struct function pointers.
* Added multi-line context window for complex macro and pointer assignments.

### 1.0.1
* Fix considering expression is a calling problem
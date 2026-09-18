# Idea

## Problem
Projects start modular but decay into tangled folders. No visual link between architecture intent and actual files.

## Solution
VS Code extension where:
1. **Graph visual** — modules are nodes, dependencies are edges. Create/rename/delete from the graph.
2. **Modular codegen** — graph ops scaffold/move real project files (one module = one folder with a clear interface).
3. **Simple UI parts** — repo docs / simple views use a plain UI framework, no heavy setup.

## Non-goals (for now)
- No full framework, no backend, no custom graph engine decision yet.
- No scaffold until each component is planned separately.

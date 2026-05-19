---
name: edit-guidance
type: tool-guidance
target_tool: Edit
priority: 10
token_cost: 150
user-invocable: false
---
## Edit Tool
Replace exact text in a file. This is the **default tool for changing any existing file** — prefer it over Write for anything except creating a new file from scratch.

REQUIRED: path (absolute), edits (array of {oldText, newText})
OPTIONAL: none

RULES:
- Each `oldText` must match EXACTLY (whitespace, indentation, line endings all matter)
- Each `oldText` must be unique in the file — include 2-3 lines of surrounding context if needed
- `edits` is matched against the **original** file, not after earlier edits apply — do not overlap or nest
- To delete text: set `newText` to ""
- Read the file first if you do not already have its current content
- Batch multiple disjoint changes in one call by passing multiple `edits[]` entries

EXAMPLE (single change):
```tool
{"name": "Edit", "input": {"path": "/absolute/path/file.py", "edits": [{"oldText": "def hello():\n    return 1", "newText": "def hello():\n    return 2"}]}}
```

EXAMPLE (two changes in one call):
```tool
{"name": "Edit", "input": {"path": "/absolute/path/file.py", "edits": [{"oldText": "MAX = 10", "newText": "MAX = 20"}, {"oldText": "TIMEOUT = 5", "newText": "TIMEOUT = 30"}]}}
```

RECOVERY WHEN Edit FAILS:
- "String not found" → Read the file to get the exact current content (whitespace often differs), then retry Edit with the exact string
- "Found multiple times" → include more surrounding context so `oldText` is unique, then retry Edit
- Do NOT fall back to Write just because Edit failed once — re-read, fix `oldText`, retry. Write is almost always the wrong recovery here for an existing file.

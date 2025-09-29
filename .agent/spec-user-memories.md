# Hash Memory System Implementation Specification

## Overview

The hash memory system is a persistent memory mechanism that allows opencode to remember user preferences, tools, and instructions across sessions using hash-prefixed commands. This system saves information to files that can be referenced by the coding agent in future interactions, enhancing context for LLM requests.

## Memory File Storage Locations

The memory system stores memories in two default locations:

- **User Memory**: Stored in `~/.claude/CLAUDE.md`
- **Project Memory**: Stored in `./CLAUDE.md` within the current project directory

Users can also specify custom memory file paths when using the hash command.

## Core Functionality

1. **Persistent Memory Storage**: The system saves information to files that can be referenced by the coding agent in future interactions.
2. **Context Enhancement**: Stored memories are incorporated into the context for LLM requests, making them available for reasoning and code generation.
3. **User Memory Input**: Users can add preferences, tools, and instructions to the agent's memory by using hash (`#`) prefixed commands.
4. **Memory Type Detection**: The system identifies hash-prefixed inputs as memory-related operations.

## Implementation Details

### Memory Namespace

The memory functionality is implemented in the `Memory` namespace located at `src/memory/index.ts`. This namespace provides the core functions for managing persistent memory.

### Core Functions

#### `formatMemoryEntry(input: string): string`

Formats memory input for storage with proper prefixing. Ensures consistent formatting for memory entries:

- If input starts with "- ", returns input as is
- If input starts with "-" (without space), adds space after dash
- Otherwise, prefixes input with "- "

```typescript
export function formatMemoryEntry(input: string): string {
  let trimmed = input.trim()
  if (!trimmed) return ""

  if (trimmed.startsWith("- ")) return trimmed
  if (trimmed.startsWith("-")) return `- ${trimmed.slice(1).trim()}`

  return `- ${trimmed}`
}
```

#### `readMemoryFile(filePath: string): Promise<string>`

Reads existing content from a memory file. Handles file not found errors gracefully by returning empty string.

```typescript
export async function readMemoryFile(filePath: string): Promise<string> {
  try {
    const exists = await Bun.file(filePath).exists()
    if (!exists) return ""
    return await Bun.file(filePath).text()
  } catch (error) {
    log.error("Failed to read memory file", { filePath, error })
    return ""
  }
}
```

#### `saveMemory(input: string, memoryPath: string = PROJECT_MEMORY_PATH): Promise<void>`

Saves memory content to a file. Creates directory structure if needed and appends new memory entries to existing content.

```typescript
export async function saveMemory(input: string, memoryPath: string = PROJECT_MEMORY_PATH): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(memoryPath)
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (error) {
      log.error("Failed to create memory directory", { dir, error })
    }

    // Read existing content
    const existingContent = await readMemoryFile(memoryPath)
    const formattedInput = formatMemoryEntry(input)

    // Combine existing content with new memory entry
    const newContent = existingContent.replace(/\n+$/, "") // Remove trailing newlines
    const combinedContent = newContent ? `${newContent}\n${formattedInput}` : formattedInput

    // Write to file
    await Bun.write(memoryPath, combinedContent, { createPath: true })
    log.info("Memory saved successfully", { memoryPath })
  } catch (error) {
    log.error("Failed to save memory", { memoryPath, error })
    throw error
  }
}
```

#### `loadMemory(): Promise<string>`

Loads memory content from both project and user memory files, combining them for context enhancement.

```typescript
export async function loadMemory(): Promise<string> {
  try {
    // Try to read project memory first
    const projectMemory = await readMemoryFile(PROJECT_MEMORY_PATH)

    // Try to read user memory
    const userMemory = await readMemoryFile(USER_MEMORY_PATH)

    // Combine memories
    const memories = []
    if (projectMemory) memories.push(projectMemory)
    if (userMemory) memories.push(userMemory)

    return memories.join("\n\n")
  } catch (error) {
    log.error("Failed to load memory", { error })
    return ""
  }
}
```

## Integration Points

### Tool System

Memory functionality is accessible through a dedicated tool defined in `src/tool/memory.ts`. This tool allows users to save memories using hash-prefixed commands and provides the interface for memory operations.

**Stub Tool Implementation:**

```typescript
// src/tool/memory.ts
import z from "zod/v4"
import { Tool } from "./tool"
import { Memory } from "../memory"
import { Log } from "../util/log"

const log = Log.create({ service: "memory-tool" })

export const MemoryTool = Tool.define("memory", {
  description: "Save user preferences and instructions to persistent memory files",
  parameters: z.object({
    input: z.string().describe("The memory content to save"),
    filePath: z.string().optional().describe("Custom memory file path (defaults to project memory)"),
  }),
  async execute(params, ctx) {
    try {
      await Memory.saveMemory(params.input, params.filePath)
      return {
        title: "Memory saved",
        metadata: { filePath: params.filePath || Memory.PROJECT_MEMORY_PATH },
        output: `Memory saved to ${params.filePath || Memory.PROJECT_MEMORY_PATH}`,
      }
    } catch (error) {
      log.error("Failed to save memory", { error, params })
      throw error
    }
  },
})
```

### Session Context Integration

Memory content is incorporated into the session context for LLM requests. This integration occurs in the session management system where context is assembled.

**Session Integration Points:**

- **Context Assembly**: Memory content is loaded during session initialization and added to the system prompt
- **Hash Command Processing**: Input prefixed with `#` is intercepted and processed as memory operations before being sent to the LLM
- **Memory Loading**: The `loadMemory()` function is called during session setup to populate context

**Stub Session Integration:**

```typescript
// Integration point in session management
export namespace Session {
  export async function createContext(): Promise<string[]> {
    const memories = await Memory.loadMemory()
    const context = []

    if (memories) {
      context.push(`## User Memories\n${memories}`)
    }

    return context
  }

  export async function processInput(input: string): Promise<{ isMemory: boolean; processedInput: string }> {
    if (input.startsWith("#")) {
      const memoryContent = input.slice(1).trim()
      await Memory.saveMemory(memoryContent)
      return { isMemory: true, processedInput: "" }
    }

    return { isMemory: false, processedInput: input }
  }
}
```

### Configuration System

Memory paths are configurable through the opencode configuration system. Users can specify custom memory file locations in their `opencode.json` configuration.

**Configuration Schema Extension:**

```typescript
// Extension to src/config/config.ts
export const Info = z
  .object({
    // ... existing fields
    memory: z
      .object({
        userPath: z.string().optional().describe("Custom user memory file path"),
        projectPath: z.string().optional().describe("Custom project memory file path"),
        enabled: z.boolean().optional().default(true).describe("Enable memory system"),
      })
      .optional(),
  })
  .strict()
```

**Configuration Integration:**

```typescript
// In Memory namespace
export const USER_MEMORY_PATH = config?.memory?.userPath || path.join(os.homedir(), ".claude", "CLAUDE.md")
export const PROJECT_MEMORY_PATH = config?.memory?.projectPath || path.join(process.cwd(), "CLAUDE.md")
```

## File Operations

The system uses standard Bun file operations to persist memory:

- `Bun.file().exists()`: Check if memory file exists
- `Bun.file().text()`: Read memory file content
- `Bun.write()`: Save memory content to files with UTF-8 encoding
- `fs.mkdir()`: Ensure memory directories exist with recursive creation

## Error Handling

The implementation includes error handling for memory operations:

- Catches file system errors during read/write operations
- Provides logging for memory operation failures
- Gracefully handles missing files by returning empty content

## Testing Considerations

### Unit Tests

Memory functionality should be thoroughly tested with unit tests covering:

- Memory entry formatting edge cases
- File read/write operations
- Directory creation scenarios
- Error handling for file system failures

**Test Examples:**

```typescript
// test/memory.test.ts
test("formatMemoryEntry handles various input formats", () => {
  expect(Memory.formatMemoryEntry("test")).toBe("- test")
  expect(Memory.formatMemoryEntry("- test")).toBe("- test")
  expect(Memory.formatMemoryEntry("-test")).toBe("- test")
  expect(Memory.formatMemoryEntry("  test  ")).toBe("- test")
})

test("saveMemory creates directory and file", async () => {
  const testPath = "/tmp/test-memory.md"
  const testContent = "This is a test memory entry"

  await Memory.saveMemory(testContent, testPath)
  const content = await Memory.readMemoryFile(testPath)
  expect(content).toBe("- This is a test memory entry")

  // Cleanup
  await fs.unlink(testPath)
})
```

### Integration Tests

- Tool integration with memory operations
- Session context loading with memory content
- Configuration-driven memory path resolution

## Migration from Claude's System

### Compatibility Layer

To maintain compatibility with existing Claude memory files:

- Default paths remain `~/.claude/CLAUDE.md` and `./CLAUDE.md`
- Existing memory content is preserved and readable
- Hash command processing maintains same behavior

### Enhanced Features

Opencode's implementation adds:

- Configurable memory paths
- Better error handling and logging
- Integration with opencode's tool and session systems
- TypeScript type safety
- Bun runtime optimizations

## Performance Considerations

### File I/O Optimization

- Memory files are read once per session during context assembly
- Write operations are atomic using Bun's file APIs
- Directory creation is cached to avoid redundant operations

### Memory Content Size

- Large memory files may impact context window limits
- Consider implementing memory pruning or archiving for old entries
- Memory loading is asynchronous to avoid blocking session initialization

## Security Considerations

### File Path Validation

- Memory file paths must be validated to prevent directory traversal attacks
- Custom memory paths should be restricted to user-writable directories
- File operations should respect opencode's existing permission system

### Content Sanitization

- Memory content should be validated before storage
- Large memory entries should be limited to prevent abuse
- Sensitive information in memory should be handled appropriately

## Future Enhancements

### Memory Management Features

- Memory search and filtering capabilities
- Memory categorization and tagging
- Memory expiration and cleanup
- Memory synchronization across devices

### Advanced Integration

- Memory-based agent personalization
- Context-aware memory suggestions
- Memory analytics and usage tracking
- Integration with external knowledge bases

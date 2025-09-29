import path from "path"
import os from "os"
import fs from "fs/promises"
import { Log } from "../util/log"

export namespace Memory {
  const log = Log.create({ service: "memory" })

  // Default memory file paths
  export const USER_MEMORY_PATH = path.join(os.homedir(), ".claude", "CLAUDE.md")
  export const PROJECT_MEMORY_PATH = path.join(process.cwd(), "CLAUDE.md")

  /**
   * Formats memory input for storage with proper prefixing
   */
  export function formatMemoryEntry(input: string): string {
    let trimmed = input.trim()
    if (!trimmed) return ""

    if (trimmed.startsWith("- ")) return trimmed
    if (trimmed.startsWith("-")) return `- ${trimmed.slice(1).trim()}`

    return `- ${trimmed}`
  }

  /**
   * Reads existing content from a memory file
   */
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

  /**
   * Saves memory content to a file
   */
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

  /**
   * Loads memory content from files
   */
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
}

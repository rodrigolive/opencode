import { test, expect } from "bun:test"
import { Memory } from "../src/memory"
import fs from "fs/promises"

test("formatMemoryEntry adds prefix when needed", () => {
  expect(Memory.formatMemoryEntry("test")).toBe("- test")
  expect(Memory.formatMemoryEntry("- test")).toBe("- test")
  expect(Memory.formatMemoryEntry("-test")).toBe("- test")
  expect(Memory.formatMemoryEntry("  test  ")).toBe("- test")
})

test("readMemoryFile returns empty string for non-existent files", async () => {
  const result = await Memory.readMemoryFile("/non/existent/file.md")
  expect(result).toBe("")
})

test("saveMemory creates directory and file", async () => {
  const testPath = "/tmp/test-memory.md"
  const testContent = "This is a test memory entry"

  // Clean up test file if it exists
  try {
    await fs.unlink(testPath)
  } catch {}

  await Memory.saveMemory(testContent, testPath)
  const content = await Memory.readMemoryFile(testPath)
  expect(content).toBe("- This is a test memory entry")

  // Clean up
  try {
    await fs.unlink(testPath)
  } catch {}
})

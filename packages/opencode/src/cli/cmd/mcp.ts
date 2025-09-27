import { cmd } from "./cmd"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Config } from "../../config/config"
import { bootstrap } from "../bootstrap"

export const McpCommand = cmd({
  command: "mcp",
  builder: (yargs) => yargs.command(McpAddCommand).command(McpListCommand).command(McpRemoveCommand).command(McpHealthCommand).demandCommand(),
  async handler() {},
})

export const McpAddCommand = cmd({
  command: "add [name] [server]",
  describe: "add an MCP server",
  builder: (yargs) =>
    yargs
      .positional("name", {
        describe: "Name of the MCP server",
        type: "string",
      })
      .positional("server", {
        describe: "HTTP(S) URL or command arguments for the MCP server",
        type: "string",
      })
      .option("http", {
        describe: "Add an HTTP(S) server",
        type: "string",
      }),
  async handler(argv) {
    const cwd = process.cwd()
    await bootstrap(cwd, async () => {
      UI.empty()
      const config = await Config.get()
      
      // Handle deprecated --http flag
      if (argv.http) {
        const name = argv.name || await prompts.text({
          message: "Enter MCP server name",
          validate: (x) => (x && x.length > 0 ? undefined : "Required"),
        })
        if (prompts.isCancel(name)) throw new UI.CancelledError()
        
        const url = argv.http
        if (!URL.canParse(url)) {
          throw new Error("Invalid URL provided")
        }
        
        const newConfig = {
          mcp: {
            ...config.mcp,
            [name]: {
              type: "remote" as const,
              url: url,
            },
          },
        }
        
        await Config.update(newConfig)
        UI.println(`Remote MCP server "${name}" configured with URL: ${url}`)
        prompts.outro("MCP server added successfully")
        return
      }

      // Handle new positional arguments
      const name = argv.name as string
      const server = argv.server as string | undefined
      
      if (server && URL.canParse(server)) {
        // It's an HTTP(S) server
        const newConfig = {
          mcp: {
            ...config.mcp,
            [name]: {
              type: "remote" as const,
              url: server,
            },
          },
        }
        
        await Config.update(newConfig)
        UI.println(`Remote MCP server "${name}" configured with URL: ${server}`)
        prompts.outro("MCP server added successfully")
        return
      }
      
      if (server) {
        // It's a local command
        const commandArray = server.split(" ").filter(Boolean)
        
        const newConfig = {
          mcp: {
            ...config.mcp,
            [name]: {
              type: "local" as const,
              command: commandArray,
            },
          },
        }
        
        await Config.update(newConfig)
        UI.println(`Local MCP server "${name}" configured with command: ${server}`)
        prompts.outro("MCP server added successfully")
        return
      }

      // Interactive mode
      const type = await prompts.select({
        message: "Select MCP server type",
        options: [
          {
            label: "Local",
            value: "local",
            hint: "Run a local command",
          },
          {
            label: "Remote",
            value: "remote",
            hint: "Connect to a remote URL",
          },
        ],
      })
      if (prompts.isCancel(type)) throw new UI.CancelledError()

      if (type === "local") {
        const command = await prompts.text({
          message: "Enter command to run",
          placeholder: "e.g., opencode x @modelcontextprotocol/server-filesystem",
          validate: (x) => (x && x.length > 0 ? undefined : "Required"),
        })
        if (prompts.isCancel(command)) throw new UI.CancelledError()

        // Parse command into array
        const commandArray = command.split(" ").filter(Boolean)
        
        const newConfig = {
          mcp: {
            ...config.mcp,
            [name]: {
              type: "local" as const,
              command: commandArray,
            },
          },
        }
        
        await Config.update(newConfig)
        UI.println(`Local MCP server "${name}" configured with command: ${command}`)
        prompts.outro("MCP server added successfully")
        return
      }

      if (type === "remote") {
        const url = await prompts.text({
          message: "Enter MCP server URL",
          placeholder: "e.g., https://example.com/mcp",
          validate: (x) => {
            if (!x) return "Required"
            if (x.length === 0) return "Required"
            const isValid = URL.canParse(x)
            return isValid ? undefined : "Invalid URL"
          },
        })
        if (prompts.isCancel(url)) throw new UI.CancelledError()

        const client = new Client({
          name: "opencode",
          version: "1.0.0",
        })
        const transport = new StreamableHTTPClientTransport(new URL(url))
        await client.connect(transport)
        
        const newConfig = {
          mcp: {
            ...config.mcp,
            [name]: {
              type: "remote" as const,
              url: url,
            },
          },
        }
        
        await Config.update(newConfig)
        UI.println(`Remote MCP server "${name}" configured with URL: ${url}`)
      }

      prompts.outro("MCP server added successfully")
    })
  },
})

async function checkMcpServerHealth(_name: string, server: Config.Mcp) {
  try {
    if (server.type === "local") {
      // For local servers, check if the command can be spawned
      const command = server.command[0]
      const { spawn } = await import("child_process")

      // Try to spawn the command to see if it exists in PATH
      // This is more reliable than existsSync for PATH commands
      return new Promise((resolve) => {
        const process = spawn(command, server.command.slice(1), {
          stdio: ["pipe", "pipe", "pipe"],
        })

        // If the process spawns successfully, it exists
        process.on("error", () => {
          resolve(`${UI.Style.TEXT_DANGER}✗${UI.Style.TEXT_NORMAL} Not working`)
        })

        // Give it a moment to start
        setTimeout(() => {
          if (process.exitCode === null) {
            process.kill()
            resolve(`${UI.Style.TEXT_SUCCESS}✓${UI.Style.TEXT_NORMAL} Working`)
          } else {
            resolve(`${UI.Style.TEXT_DANGER}✗${UI.Style.TEXT_NORMAL} Not working`)
          }
        }, 100)
      })
    } else if (server.type === "remote") {
      // For remote servers, try to connect and ping
      const client = new Client({
        name: "opencode-health-check",
        version: "1.0.0",
      })
      const transport = new StreamableHTTPClientTransport(new URL(server.url))
      await client.connect(transport)
      await client.ping()
      await client.close()
      return `${UI.Style.TEXT_SUCCESS}✓${UI.Style.TEXT_NORMAL} Working`
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return `${UI.Style.TEXT_DANGER}✗${UI.Style.TEXT_NORMAL} Error: ${error.message}`
    }
    return `${UI.Style.TEXT_DANGER}✗${UI.Style.TEXT_NORMAL} Error: Unknown error`
  }

  return `${UI.Style.TEXT_DIM}?${UI.Style.TEXT_NORMAL} Unknown status`
}

export const McpListCommand = cmd({
  command: "list",
  describe: "list all MCP servers",
  async handler() {
    const cwd = process.cwd()
    await bootstrap(cwd, async () => {
      UI.empty()
      const config = await Config.get()
      const mcpServers = config.mcp || {}

      if (Object.keys(mcpServers).length === 0) {
        UI.println("No MCP servers configured")
        return
      }

      UI.println("Checking MCP server health...")
      for (const [name, server] of Object.entries(mcpServers)) {
        const status = await checkMcpServerHealth(name, server)
        if (server.type === "local") {
          UI.println(`${name}: ${server.command.join(" ")} - ${status}`)
        } else if (server.type === "remote") {
          UI.println(`${name}: ${server.url} (HTTP) - ${status}`)
        }
      }
    })
  },
})

export const McpRemoveCommand = cmd({
  command: "remove <name>",
  describe: "remove an MCP server",
  builder: (yargs) =>
    yargs.positional("name", {
      describe: "Name of the MCP server to remove",
      type: "string",
    }),
  async handler(argv) {
    const cwd = process.cwd()
    await bootstrap(cwd, async () => {
      UI.empty()
      const config = await Config.get()
      const mcpServers = config.mcp || {}
      const name = argv.name as string

      if (!mcpServers[name]) {
        prompts.log.error(`MCP server "${name}" not found`)
        return
      }

      // Create new config without the specified server
      const { [name]: removed, ...remaining } = mcpServers

      const newConfig = {
        mcp: Object.keys(remaining).length > 0 ? remaining : undefined,
      }

      await Config.update(newConfig)
      UI.println(`MCP server "${name}" removed successfully`)
      prompts.outro("MCP server removed successfully")
    })
  },
})

export const McpHealthCommand = cmd({
  command: "health [name]",
  describe: "check the health of MCP servers",
  builder: (yargs) =>
    yargs.positional("name", {
      describe: "Name of specific MCP server to check (optional)",
      type: "string",
    }),
  async handler(argv) {
    const cwd = process.cwd()
    await bootstrap(cwd, async () => {
      UI.empty()
      const config = await Config.get()
      const mcpServers = config.mcp || {}

      if (Object.keys(mcpServers).length === 0) {
        UI.println("No MCP servers configured")
        return
      }

      const serverName = argv.name as string | undefined

      if (serverName) {
        // Check specific server
        const server = mcpServers[serverName]
        if (!server) {
          prompts.log.error(`MCP server "${serverName}" not found`)
          return
        }

        UI.println(`Checking health of MCP server "${serverName}"...`)
        const status = await checkMcpServerHealth(serverName, server)
        if (server.type === "local") {
          UI.println(`${serverName}: ${server.command.join(" ")} - ${status}`)
        } else if (server.type === "remote") {
          UI.println(`${serverName}: ${server.url} (HTTP) - ${status}`)
        }
      } else {
        // Check all servers
        UI.println("Checking health of all MCP servers...")
        for (const [name, server] of Object.entries(mcpServers)) {
          const status = await checkMcpServerHealth(name, server)
          if (server.type === "local") {
            UI.println(`${name}: ${server.command.join(" ")} - ${status}`)
          } else if (server.type === "remote") {
            UI.println(`${name}: ${server.url} (HTTP) - ${status}`)
          }
        }
      }
    })
  },
})

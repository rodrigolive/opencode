import { cmd } from "./cmd"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Config } from "../../config/config"
import { bootstrap } from "../bootstrap"

export const McpCommand = cmd({
  command: "mcp",
  builder: (yargs) => yargs.command(McpAddCommand).command(McpListCommand).command(McpRemoveCommand).demandCommand(),
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
        prompts.log.info(`Remote MCP server "${name}" configured with URL: ${url}`)
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
        prompts.log.info(`Remote MCP server "${name}" configured with URL: ${server}`)
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
        prompts.log.info(`Local MCP server "${name}" configured with command: ${server}`)
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
        prompts.log.info(`Local MCP server "${name}" configured with command: ${command}`)
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
        prompts.log.info(`Remote MCP server "${name}" configured with URL: ${url}`)
      }

      prompts.outro("MCP server added successfully")
    })
  },
})

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
        prompts.log.info("No MCP servers configured")
        return
      }
      
      prompts.log.info("Configured MCP servers:")
      for (const [name, server] of Object.entries(mcpServers)) {
        if (server.type === "local") {
          prompts.log.info(`  ${name}: local - ${server.command.join(" ")}`)
        } else if (server.type === "remote") {
          prompts.log.info(`  ${name}: remote - ${server.url}`)
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
      prompts.log.info(`MCP server "${name}" removed successfully`)
      prompts.outro("MCP server removed successfully")
    })
  },
})

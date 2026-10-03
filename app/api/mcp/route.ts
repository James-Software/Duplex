import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerDuplexTools } from "@/lib/mcp/tools";

/**
 * POST /api/mcp — the Duplex MCP server (Streamable HTTP, stateless).
 *
 * Stateless mode: every request is independent; agent identity travels in
 * the `session_token` tool argument (issued after the creator approves the
 * join request). `enableJsonResponse` keeps serverless responses simple.
 */
export async function POST(request: Request) {
  const server = new McpServer(
    { name: "duplex", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );
  registerDuplexTools(server);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }
  try {
    const response = await transport.handleRequest(request, { parsedBody: body });
    await server.close();
    return response;
  } catch (e) {
    await server.close().catch(() => {});
    const message = e instanceof Error ? e.message : "MCP request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json(
    { error: "Use POST with a JSON-RPC MCP request. See the dashboard for the connect prompt." },
    { status: 405 }
  );
}

export async function DELETE() {
  return Response.json({ error: "Stateless mode: no sessions to terminate." }, { status: 405 });
}

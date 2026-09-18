export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpResourceContent {
  type: "resource";
  resource: {
    uri: string;
    text?: string;
    mimeType?: string;
  };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
  content?: Array<McpTextContent | McpResourceContent | Record<string, unknown>>;
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpServerInfo {
  name: string;
  version?: string;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: McpServerInfo;
}

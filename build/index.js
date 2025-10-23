import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getAlerts, getForecast, alertsSchema, forecastSchema } from "./weather.js";
// Create server instance
const server = new McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
});
// Register weather tools
server.tool("get_alerts", "Get weather alerts for a state", alertsSchema.shape, async ({ state }) => {
    return await getAlerts(state);
});
server.tool("get_forecast", "Get weather forecast for a location", forecastSchema.shape, async ({ latitude, longitude }) => {
    return await getForecast(latitude, longitude);
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Weather MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});

# Weather MCP Server

A Model Context Protocol (MCP) server that provides weather data using the National Weather Service API. This server supports both stdio (local) and HTTP (remote) transports.

## Features

- **get_forecast**: Get weather forecast for any US location using latitude/longitude
- **get_alerts**: Get active weather alerts for any US state using 2-letter state code

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Start the HTTP server:
```bash
npm run start:http
```

The server will run on `http://localhost:3001`

### Testing the Server

Test the health endpoint:
```bash
curl http://localhost:3001/health
```

Test the forecast tool:
```bash
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{"tool":"get_forecast","params":{"latitude":40.7128,"longitude":-74.0060}}'
```

Test the alerts tool:
```bash
curl -X POST http://localhost:3001/mcp/call \
  -H "Content-Type: application/json" \
  -d '{"tool":"get_alerts","params":{"state":"CA"}}'
```

## Connecting to thesys.dev

To connect this MCP server to thesys.dev:

1. **Deploy the server** to a publicly accessible URL (e.g., Railway, Render, Vercel, etc.)

2. **Add to thesys.dev** using these settings:
   - **Name**: `Weather MCP Server`
   - **URL**: `https://your-deployed-server.com` (your actual deployment URL)
   - **Transport Type**: `Streamable HTTP` (not SSE)
   - **Bearer Token**: Leave empty (optional)
   - **Description**: `Weather data from National Weather Service API`

3. **Available endpoints** your deployed server will provide:
   - `GET /health` - Health check
   - `GET /mcp/info` - Server information
   - `GET /mcp/tools` - Available tools list
   - `POST /mcp/call` - Execute tools

## Deployment Options

### Option 1: Railway
1. Connect your GitHub repository to Railway
2. Railway will auto-detect the Node.js project
3. Set environment variable `PORT` (Railway provides this automatically)
4. Deploy and use the provided URL

### Option 2: Render (Recommended)
1. Create a new Web Service on Render
2. Connect your GitHub repository: `https://github.com/x8yuv/MCPServer.git`
3. Use these **exact** settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start` (this now runs the HTTP server)
   - **Environment**: Add `NODE_ENV=production`
4. Deploy and use the provided `.onrender.com` URL

**Important**: The default `npm start` now runs the HTTP server (`build/index.http.js`), not the stdio server.

### Option 3: Vercel
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in your project directory
3. Follow the prompts to deploy
4. Use the provided URL

## API Reference

### Tools

#### get_forecast
Get weather forecast for a location.

**Parameters:**
- `latitude` (number): Latitude (-90 to 90)
- `longitude` (number): Longitude (-180 to 180)

**Example:**
```json
{
  "tool": "get_forecast",
  "params": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

#### get_alerts
Get weather alerts for a state.

**Parameters:**
- `state` (string): Two-letter state code (e.g., "CA", "NY")

**Example:**
```json
{
  "tool": "get_alerts",
  "params": {
    "state": "CA"
  }
}
```

## Error Handling

The server includes comprehensive error handling:
- Parameter validation using Zod schemas
- HTTP error responses with appropriate status codes
- Detailed error messages for debugging

## CORS Configuration

The server is configured with permissive CORS settings to work with thesys.dev:
- Origin: `*` (all origins allowed)
- Methods: `GET`, `POST`, `OPTIONS`
- Headers: `Content-Type`, `Authorization`, `X-Requested-With`

## Data Source

This server uses the National Weather Service API, which:
- Provides free weather data for US locations
- Requires no API key
- Updates regularly with official weather information
- Only supports US locations (territories included)

## Troubleshooting

### Render Deployment Issues

#### "Application exited early" Error
This happens when Render runs the wrong entry point. **Solution:**
1. Ensure `package.json` has `"start": "node build/index.http.js"`
2. In Render settings, use **Start Command**: `npm start`
3. **Never use** `node build/index.js` (that's the stdio server)

#### Server Logs Show "running on stdio"
This means the wrong server is running. **Fix:**
1. Check Render **Start Command** is `npm start`
2. Verify `package.json` main field is `"build/index.http.js"`
3. Redeploy after making changes

### MAX_RETRIES_EXCEEDED Error
This error typically occurs when:
1. The server URL is incorrect or not accessible
2. The server is not running (check Render logs)
3. Using wrong transport type (must be `Streamable HTTP`)
4. Network connectivity issues

**Solutions:**
1. Verify your deployed server is accessible: `https://your-app.onrender.com/health`
2. Check Render service logs for errors
3. Ensure the server is running and responding
4. Test endpoints manually before connecting to thesys.dev

### Connection Issues
1. Make sure you're using `Streamable HTTP` transport type in thesys.dev
2. Verify the server URL is correct and publicly accessible
3. Test the server endpoints manually before connecting to thesys.dev
4. Check that Render service is "Live" (not sleeping)

## License

ISC
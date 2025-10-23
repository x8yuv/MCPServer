#!/usr/bin/env node
/**
 * @file index.http.ts
 * @summary Weather MCP Server with SSE Transport
 * @description This server provides weather data via the Model Context Protocol (MCP)
 * using the SSE (Server-Sent Events) transport for compatibility with MCP Inspector.
 *
 * @architecture
 * 1. **Singleton `McpServer`**: One instance holds all weather capabilities.
 * 2. **Per-Session Transports**: A new `SSEServerTransport` for each client session.
 * 3. **Weather API Integration**: Uses National Weather Service API for data.
 * 4. **Proper Error Handling**: Uses McpError with appropriate error codes.
 */

// --- Core Node.js and Express Dependencies ---
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import type http from 'http';

// --- Model Context Protocol (MCP) SDK Dependencies ---
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// --- Weather-specific Dependencies ---
import { z } from 'zod';
import {
  makeNWSRequest,
  formatAlert,
  type AlertFeature,
  type ForecastPeriod,
  type AlertsResponse,
  type PointsResponse,
  type ForecastResponse,
} from './weather.js';

// --- Global Server Configuration ---
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const portArg = portIndex !== -1 ? args[portIndex + 1] : undefined;

const PORT = (portArg ? parseInt(portArg, 10) : undefined) || Number(process.env['PORT']) || 8123;
const HOST = process.env['HOST'] || 'localhost';
const CORS_ORIGIN = process.env['CORS_ORIGIN'] || '*';

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

// --- Global State Management ---
// Active client transports, keyed by session ID
const transports: { [sessionId: string]: SSEServerTransport } = {};

// ===================================================================================
// === BUSINESS LOGIC CORE (Weather Server Factory)
// ===================================================================================
/**
 * Creates and configures a new `McpServer` instance with all weather-related
 * capabilities. This function is the single source of truth for what our server can do.
 */
function createWeatherServer(): McpServer {
  // Tool name constants to prevent typos
  const TOOL_NAMES = {
    GET_ALERTS: 'get_alerts',
    GET_FORECAST: 'get_forecast',
  } as const;

  const server = new McpServer(
    {
      name: 'weather-sse-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
      },
    },
  );

  // --- TOOL: get_alerts ---
  server.tool(
    TOOL_NAMES.GET_ALERTS,
    'Get weather alerts for a US state',
    {
      state: z.string().length(2).describe('Two-letter state code (e.g. CA, NY)'),
    },
    async ({ state }) => {
      const stateCode = state.toUpperCase();

      try {
        const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
        const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

        if (!alertsData) {
          throw new McpError(
            ErrorCode.InternalError,
            'Failed to retrieve alerts data from weather service'
          );
        }

        const features = alertsData.features || [];
        if (features.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No active weather alerts for ${stateCode}`,
              },
            ],
          };
        }

        const formattedAlerts = features.map(formatAlert);
        const alertsText = `Active weather alerts for ${stateCode}:\n\n${formattedAlerts.join('\n\n')}`;

        return {
          content: [
            {
              type: 'text',
              text: alertsText,
            },
          ],
        };
      } catch (error: unknown) {
        if (error instanceof McpError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(
          ErrorCode.InternalError,
          `Weather service error: ${errorMessage}`
        );
      }
    },
  );

  // --- TOOL: get_forecast ---
  server.tool(
    TOOL_NAMES.GET_FORECAST,
    'Get weather forecast for a specific location (US only)',
    {
      latitude: z.number().min(-90).max(90).describe('Latitude of the location'),
      longitude: z.number().min(-180).max(180).describe('Longitude of the location'),
    },
    async ({ latitude, longitude }) => {
      try {
        // Get grid point data first
        const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
        const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

        if (!pointsData) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Location ${latitude}, ${longitude} is not supported by the weather service (only US locations are supported)`
          );
        }

        const forecastUrl = pointsData.properties?.forecast;
        if (!forecastUrl) {
          throw new McpError(
            ErrorCode.InternalError,
            'Failed to get forecast URL from weather service'
          );
        }

        // Get forecast data
        const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
        if (!forecastData) {
          throw new McpError(
            ErrorCode.InternalError,
            'Failed to retrieve forecast data from weather service'
          );
        }

        const periods = forecastData.properties?.periods || [];
        if (periods.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No forecast periods available for this location',
              },
            ],
          };
        }

        // Format forecast periods
        const formattedForecast = periods.map((period: ForecastPeriod) =>
          [
            `${period.name || 'Unknown'}:`,
            `Temperature: ${period.temperature || 'Unknown'}°${period.temperatureUnit || 'F'}`,
            `Wind: ${period.windSpeed || 'Unknown'} ${period.windDirection || ''}`,
            `${period.shortForecast || 'No forecast available'}`,
            '---',
          ].join('\n')
        );

        const forecastText = `Weather forecast for ${latitude.toFixed(4)}, ${longitude.toFixed(4)}:\n\n${formattedForecast.join('\n\n')}`;

        return {
          content: [
            {
              type: 'text',
              text: forecastText,
            },
          ],
        };
      } catch (error: unknown) {
        if (error instanceof McpError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(
          ErrorCode.InternalError,
          `Weather service error: ${errorMessage}`
        );
      }
    },
  );

  return server;
}

// ===================================================================================
// === SINGLETON PATTERN INSTANTIATION
// ===================================================================================
const sharedMcpServer: McpServer = createWeatherServer();
console.warn('[Weather Server] Shared Weather MCP Server instance created.');

// ===================================================================================
// === WEB SERVER SETUP (Express.js)
// ===================================================================================
const app = express();

// --- Middleware Configuration ---
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  exposedHeaders: ['Mcp-Session-Id'],
}));
app.use(express.json());

// ===================================================================================
// === SSE ENDPOINTS (FOR MCP INSPECTOR COMPATIBILITY)
// ===================================================================================

// SSE endpoint for establishing the stream
app.get('/sse', (_req: Request, res: Response) => {
  void (async () => {
    console.warn('[Weather MCP] GET /sse - Establishing SSE stream...');

    try {
      // Create a new SSE transport for this client
      const transport = new SSEServerTransport('/messages', res);

      // Store the transport by its auto-generated session ID
      const sessionId = transport.sessionId;
      transports[sessionId] = transport;

      console.warn(`[Weather MCP] SSE stream established with session ID: ${sessionId}`);

      // Set up cleanup when the connection closes
      transport.onclose = () => {
        console.warn(`[Weather MCP] SSE transport closed for session ${sessionId}`);
        delete transports[sessionId];
      };

      // Connect the transport to our shared MCP server
      await sharedMcpServer.connect(transport);
    } catch (error) {
      console.error('[Weather MCP] Error establishing SSE stream:', error);
      if (!res.headersSent) {
        res.status(500).send('Error establishing SSE stream');
      }
    }
  })();
});

// Messages endpoint for receiving client JSON-RPC requests
app.post('/messages', (req: Request, res: Response) => {
  void (async () => {
    console.warn('[Weather MCP] POST /messages - Handling client message...');

    // Extract session ID from URL query parameter
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      console.error('[Weather MCP] No session ID provided in query parameter');
      res.status(400).send('Missing sessionId query parameter');
      return;
    }

    const transport = transports[sessionId];
    if (!transport) {
      console.error(`[Weather MCP] No active transport found for session ID: ${sessionId}`);
      res.status(404).send('Session not found');
      return;
    }

    try {
      // Delegate to the SSE transport to handle the message
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('[Weather MCP] Error handling POST message:', error);
      if (!res.headersSent) {
        res.status(500).send('Error handling request');
      }
    }
  })();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    activeSessions: Object.keys(transports).length,
    transport: 'sse',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    server: 'weather-mcp-server',
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Weather SSE MCP Server',
    version: '1.0.0',
    transport: 'sse',
    endpoints: {
      sse: '/sse',
      messages: '/messages',
      health: '/health',
    },
    instructions: 'GET /sse to establish SSE stream, then POST to /messages?sessionId=<id>',
    capabilities: {
      tools: ['get_alerts', 'get_forecast'],
      weather_api: 'National Weather Service (US only)',
    },
  });
});

// ===================================================================================
// === SERVER STARTUP
// ===================================================================================
const httpServer: http.Server = app.listen(PORT, () => {
  console.warn(`
╔═══════════════════════════════════════════════════════════╗
║           Weather SSE MCP Server Started                  ║
╠═══════════════════════════════════════════════════════════╣
║  Transport: SSE (Protocol version 2024-11-05)             ║
║  Port: ${PORT}                                              ║
║  SSE Endpoint: GET http://${HOST}:${PORT}/sse                ║
║  Messages: POST http://${HOST}:${PORT}/messages?sessionId=<id> ║
║  Health: http://${HOST}:${PORT}/health                       ║
║                                                           ║
║  This server provides weather data via MCP protocol.      ║
║  Supports US locations only (National Weather Service).   ║
╚═══════════════════════════════════════════════════════════╝

To test with MCP Inspector:
npx @modelcontextprotocol/inspector sse http://localhost:${PORT}/sse
  `);
});

// ===================================================================================
// === GRACEFUL SHUTDOWN
// ===================================================================================
const shutdown = () => {
  console.warn('\n[Weather Server] Shutting down gracefully...');

  // Close all active client transports
  console.warn(`[Weather Server] Closing ${Object.keys(transports).length} active sessions...`);
  for (const sessionId in transports) {
    try {
      const transport = transports[sessionId];
      if (transport) {
        const closeResult = transport.close();
        if (closeResult instanceof Promise) {
          void closeResult.catch((error: unknown) => {
            console.error(`Failed to close session ${sessionId}:`, error);
          });
        }
      }
    } catch (error: unknown) {
      console.error(`Failed to close session ${sessionId}:`, error);
    }
  }

  // Stop the HTTP server
  httpServer.close(() => {
    console.warn('[Weather Server] HTTP server closed. Exiting.');
    process.exit(0);
  });

  // Force exit timer
  setTimeout(() => {
    console.error('[Weather Server] Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 5000);
};

// Handle termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

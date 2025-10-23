import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { getAlerts, getForecast, alertsSchema, forecastSchema } from './weather.js';
const app = express();
// CORS configuration for thesys.dev
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
}));
app.use(express.json());
// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'weather-mcp-server'
    });
});
// MCP protocol endpoints
app.get('/mcp/info', (_req, res) => {
    res.json({
        name: 'weather',
        version: '1.0.0',
        description: 'Weather MCP Server providing NWS weather data',
        capabilities: {
            tools: true,
            resources: false
        }
    });
});
app.get('/mcp/tools', (_req, res) => {
    res.json({
        tools: [
            {
                name: 'get_alerts',
                description: 'Get weather alerts for a state',
                inputSchema: {
                    type: 'object',
                    properties: {
                        state: {
                            type: 'string',
                            minLength: 2,
                            maxLength: 2,
                            description: 'Two-letter state code (e.g. CA, NY)'
                        }
                    },
                    required: ['state']
                }
            },
            {
                name: 'get_forecast',
                description: 'Get weather forecast for a location',
                inputSchema: {
                    type: 'object',
                    properties: {
                        latitude: {
                            type: 'number',
                            minimum: -90,
                            maximum: 90,
                            description: 'Latitude of the location'
                        },
                        longitude: {
                            type: 'number',
                            minimum: -180,
                            maximum: 180,
                            description: 'Longitude of the location'
                        }
                    },
                    required: ['latitude', 'longitude']
                }
            }
        ]
    });
});
// SSE endpoint for thesys.dev
app.get('/sse', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });
    // Send server info
    res.write(`data: ${JSON.stringify({
        type: 'server_info',
        name: 'weather',
        version: '1.0.0',
        tools: ['get_alerts', 'get_forecast']
    })}\n\n`);
    // Keep connection alive
    const keepAlive = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
    }, 30000);
    req.on('close', () => {
        clearInterval(keepAlive);
    });
});
app.post('/mcp/call', async (req, res) => {
    try {
        const { tool, params = {} } = req.body || {};
        if (!tool) {
            return res.status(400).json({
                error: 'Missing tool name',
                code: 'MISSING_TOOL'
            });
        }
        console.log(`MCP call: ${tool}`, params);
        switch (tool) {
            case 'get_alerts': {
                try {
                    const validatedParams = alertsSchema.parse(params);
                    const result = await getAlerts(validatedParams.state);
                    return res.json(result);
                }
                catch (error) {
                    if (error instanceof z.ZodError) {
                        return res.status(400).json({
                            error: 'Invalid parameters for get_alerts',
                            details: error.errors,
                            code: 'VALIDATION_ERROR'
                        });
                    }
                    throw error;
                }
            }
            case 'get_forecast': {
                try {
                    const validatedParams = forecastSchema.parse(params);
                    const result = await getForecast(validatedParams.latitude, validatedParams.longitude);
                    return res.json(result);
                }
                catch (error) {
                    if (error instanceof z.ZodError) {
                        return res.status(400).json({
                            error: 'Invalid parameters for get_forecast',
                            details: error.errors,
                            code: 'VALIDATION_ERROR'
                        });
                    }
                    throw error;
                }
            }
            default:
                return res.status(400).json({
                    error: `Unknown tool: ${tool}`,
                    code: 'UNKNOWN_TOOL',
                    availableTools: ['get_alerts', 'get_forecast']
                });
        }
    }
    catch (error) {
        console.error('Error in MCP call:', error);
        return res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Root endpoint with MCP server info
app.get('/', (_req, res) => {
    res.json({
        name: 'Weather MCP Server',
        version: '1.0.0',
        description: 'MCP server for weather data using National Weather Service API',
        protocol: 'MCP JSON-RPC 2.0',
        endpoints: {
            health: '/health',
            mcp: '/mcp',
            sse: '/mcp/sse',
            // Legacy REST endpoints
            info: '/mcp/info',
            tools: '/mcp/tools',
            call: '/mcp/call'
        },
        usage: {
            mcp_jsonrpc: {
                method: 'POST',
                url: '/mcp',
                body: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'get_forecast',
                        arguments: {
                            latitude: 40.7128,
                            longitude: -74.0060
                        }
                    }
                }
            },
            legacy_rest: {
                method: 'POST',
                url: '/mcp/call',
                body: {
                    tool: 'get_forecast',
                    params: {
                        latitude: 40.7128,
                        longitude: -74.0060
                    }
                }
            }
        }
    });
});
// Error handling middleware
app.use((error, _req, res, _next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});
// 404 handler
app.use((_req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND'
    });
});
const PORT = process.env.PORT || 3001;
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Weather MCP HTTP Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: /health`);
    console.log(`Tools list: /mcp/tools`);
});
export default app;

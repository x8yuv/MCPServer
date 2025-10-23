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
        } catch (error) {
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
        } catch (error) {
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
  } catch (error) {
    console.error('Error in MCP call:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Root endpoint with server info
app.get('/', (_req, res) => {
  res.json({
    name: 'Weather MCP Server',
    version: '1.0.0',
    description: 'HTTP-based MCP server for weather data using National Weather Service API',
    endpoints: {
      health: '/health',
      info: '/mcp/info',
      tools: '/mcp/tools',
      call: '/mcp/call'
    },
    usage: {
      example: {
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
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

app.listen(PORT, () => {
  console.log(`Weather MCP HTTP Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Tools list: http://localhost:${PORT}/mcp/tools`);
});

export default app;
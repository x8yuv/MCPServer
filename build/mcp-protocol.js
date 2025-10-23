import { getAlerts, getForecast } from './weather.js';
// MCP Protocol Handler
export class MCPProtocolHandler {
    async handleRequest(request) {
        const { id, method, params } = request;
        try {
            switch (method) {
                case 'initialize':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                tools: {}
                            },
                            serverInfo: {
                                name: 'weather',
                                version: '1.0.0'
                            }
                        }
                    };
                case 'tools/list':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
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
                        }
                    };
                case 'tools/call':
                    const { name, arguments: args } = params;
                    if (name === 'get_alerts') {
                        const result = await getAlerts(args.state);
                        return {
                            jsonrpc: '2.0',
                            id,
                            result
                        };
                    }
                    if (name === 'get_forecast') {
                        const result = await getForecast(args.latitude, args.longitude);
                        return {
                            jsonrpc: '2.0',
                            id,
                            result
                        };
                    }
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -32601,
                            message: `Unknown tool: ${name}`
                        }
                    };
                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${method}`
                        }
                    };
            }
        }
        catch (error) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: error instanceof Error ? error.message : 'Unknown error'
                }
            };
        }
    }
}

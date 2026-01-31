const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const path = require('path');

const app = express();

// Configuration
const WRAPPER_PORT = parseInt(process.env.PORT || '8080', 10);
const OPENCLAW_PORT = 18789; // Internal OpenClaw gateway port
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || 'changeme';
const STATE_DIR = process.env.OPENCLAW_STATE_DIR || '/root/.openclaw';
const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE_DIR || '/root/workspace';

let gatewayProcess = null;

// Start OpenClaw gateway
function startGateway() {
    console.log('[wrapper] Starting OpenClaw gateway...');

    const args = [
        '/openclaw/dist/index.js',
        'gateway',
        '--bind', 'loopback',
        '--port', String(OPENCLAW_PORT),
        '--token', OPENCLAW_TOKEN
    ];

    gatewayProcess = spawn('node', args, {
        env: {
            ...process.env,
            OPENCLAW_STATE_DIR: STATE_DIR,
            OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
            NODE_ENV: 'production'
        },
        stdio: ['ignore', 'inherit', 'inherit']
    });

    gatewayProcess.on('error', (err) => {
        console.error('[wrapper] Gateway process error:', err);
    });

    gatewayProcess.on('exit', (code, signal) => {
        console.log(`[wrapper] Gateway exited with code ${code}, signal ${signal}`);
        // Auto-restart on unexpected exit
        if (code !== 0 && code !== null) {
            console.log('[wrapper] Restarting gateway in 5 seconds...');
            setTimeout(startGateway, 5000);
        }
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    const status = gatewayProcess && !gatewayProcess.killed ? 'healthy' : 'unhealthy';
    res.json({ status, port: WRAPPER_PORT, gateway: OPENCLAW_PORT });
});

// Reverse proxy all other traffic to OpenClaw gateway
app.use('/', createProxyMiddleware({
    target: `http://127.0.0.1:${OPENCLAW_PORT}`,
    changeOrigin: false,
    ws: true, // Enable WebSocket proxying
    logLevel: 'info',
    onError: (err, req, res) => {
        console.error('[proxy] Error:', err.message);
        res.status(502).json({
            error: 'Gateway unavailable',
            message: 'OpenClaw gateway is starting or unreachable'
        });
    }
}));

// Start wrapper server
const server = app.listen(WRAPPER_PORT, '0.0.0.0', () => {
    console.log(`[wrapper] Listening on port ${WRAPPER_PORT}`);
    console.log(`[wrapper] Proxying to OpenClaw on 127.0.0.1:${OPENCLAW_PORT}`);

    // Start gateway after wrapper is ready
    setTimeout(startGateway, 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[wrapper] SIGTERM received, shutting down gracefully');
    server.close(() => {
        if (gatewayProcess) {
            gatewayProcess.kill('SIGTERM');
        }
        process.exit(0);
    });
});

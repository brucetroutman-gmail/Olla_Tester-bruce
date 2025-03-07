import { createServer } from 'http';
import { parse } from 'url';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execPromise = promisify(exec);

const server = createServer(async (req, res) => {
    const { pathname } = parse(req.url, true);
    const normalizedPath = pathname.replace(/^\/+|\/+$/g, '');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (normalizedPath === 'run-prompt' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { model, prompt } = JSON.parse(body);
            if (!model || !prompt) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Model and prompt are required' }));
                return;
            }

            try {
                const args = ['run', model, '--verbose', prompt];
                const process = spawn('ollama', args, { stdio: ['ignore', 'pipe', 'pipe'] });
                let stdout = '';
                let stderr = '';

                process.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                process.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                const exitPromise = new Promise((resolve, reject) => {
                    process.on('close', (code) => {
                        if (code === 0) {
                            resolve();
                        } else {
                            reject(new Error(`Process exited with code ${code}`));
                        }
                    });
                    process.on('error', (err) => reject(err));
                });

                const timeout = setTimeout(() => {
                    process.kill('SIGTERM');
                }, 30000);

                await exitPromise;
                clearTimeout(timeout);

                if (stderr && stderr.includes('not found')) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Model '${model}' not found` }));
                    return;
                }

                const fullOutput = stdout + stderr;
                const response = fullOutput
                    .split('\n')
                    .filter(line => !line.match(/duration|count|rate/i))
                    .join('\n')
                    .replace(/\u001b\[.*?[a-zA-Z]/g, '')
                    .trim();
                const metrics = parseMetrics(fullOutput);
                const responseData = { response, metrics };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(responseData));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else if (normalizedPath === 'save-conversation' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const conversation = JSON.parse(body);
            const filename = `${conversation.name || 'unnamed'}.json`;
            const filePath = path.join(process.cwd(), 'conversations', filename);

            // Add system info
            const systemInfo = await getSystemInfo();
            conversation.systemInfo = systemInfo;

            try {
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ filename }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else if (normalizedPath === 'system-info' && req.method === 'GET') {
        try {
            const systemInfo = await getSystemInfo();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(systemInfo));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else if (req.method === 'GET') {
        let filePath = path.join(process.cwd(), 'client', normalizedPath || 'index.html');
        try {
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
                const ext = path.extname(filePath).toLowerCase();
                const contentType = {
                    '.html': 'text/html',
                    '.mjs': 'application/javascript',
                    '.css': 'text/css'
                }[ext] || 'application/octet-stream';
                const fileContent = await fs.readFile(filePath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(fileContent);
            } else {
                throw new Error('Not a file');
            }
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not Found' }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

async function getSystemInfo() {
    const systemInfo = {
        platform: os.platform(),
        macModel: '',
        processor: os.cpus()[0].model,
        memory: `${(os.totalmem() / (1024 ** 3)).toFixed(2)} GB`,
        macOS: '',
        graphics: ''
    };

    if (os.platform() === 'darwin') {
        try {
            const [model, osVersion, graphics] = await Promise.all([
                execPromise('sysctl -n hw.model'),
                execPromise('sw_vers -productVersion'),
                execPromise('system_profiler SPDisplaysDataType | grep "Chipset Model"')
            ]);
            systemInfo.macModel = model.stdout.trim();
            systemInfo.macOS = osVersion.stdout.trim();
            systemInfo.graphics = graphics.stdout.split('\n')[0]?.trim() || 'Unknown';
        } catch (error) {
            // Silent fail for system info
        }
    }
    return systemInfo;
}

function parseMetrics(output) {
    const metrics = {};
    const lines = output.split('\n');
    lines.forEach(line => {
        const match = line.match(/^\s*(total duration|load duration|prompt eval count|prompt eval duration|prompt eval rate|eval count|eval duration|eval rate)\s*[:=]?\s*(.+)$/i);
        if (match) {
            const key = match[1].trim().replace(/\s+/g, '_');
            const value = match[2].trim();
            metrics[key] = value;
        }
    });
    return metrics;
}

server.listen(3022, () => {
    console.log('Server running at http://localhost:3022');
});
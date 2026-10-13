import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';

describe('backend scaffold', () => {
  it('serves a healthy response without external services', async () => {
    const port = 4123;
    const server = spawn(process.execPath, ['--import', 'tsx/esm', 'src/server.ts'], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for the backend')),
          25_000,
        );
        const onOutput = (chunk: Buffer) => {
          if (chunk.toString().includes(`port ${port}`)) {
            clearTimeout(timeout);
            resolve();
          }
        };
        server.stdout.on('data', onOutput);
        server.stderr.on('data', onOutput);
        server.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      const response = await fetch(`http://127.0.0.1:${port}/health`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: { status: 'ok' },
        message: 'Backend is healthy',
      });
    } finally {
      server.kill();
    }
  }, 30_000);
});

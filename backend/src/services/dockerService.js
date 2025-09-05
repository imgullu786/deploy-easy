import Docker from 'dockerode';
import { promises as fs } from 'fs';
import path from 'path';

class DockerService {
  constructor() {
    this.docker = new Docker(); // uses /var/run/docker.sock by default
    this.portCounter = 3001;    // starting host port
  }

  /**
   * Build image (creating Dockerfile if missing), stop old container, run new.
   */
  async buildAndDeploy(projectPath, projectId, envVars = {}) {
    try {
      await this.ensureDockerfile(projectPath, projectId);
      const imageName = `project-${projectId}:latest`;

      await this.buildImage(projectPath, imageName, projectId);
      await this.stopExistingContainer(projectId);

      const runInfo = await this.runContainer({ imageName, projectId, envVars });
      return runInfo;
    } catch (error) {
      this.emitBuildLog(projectId, 'error', `Docker deployment failed: ${error.message}`);
      throw new Error(`Docker deployment failed: ${error.message}`);
    }
  }

  /**
   * Ensure a Dockerfile exists. Create a secure, minimal Node Dockerfile if missing.
   */
  async ensureDockerfile(projectPath, projectId) {
    const dockerfilePath = path.join(projectPath, 'Dockerfile');

    try {
      await fs.access(dockerfilePath);
      this.emitBuildLog(projectId, 'info', 'Using existing Dockerfile');
      return;
    } catch {
      /* fallthrough and create one */
    }

    this.emitBuildLog(projectId, 'info', 'Creating default Dockerfile for Node.js application');

    // node:18-alpine doesn’t include curl by default — needed for HEALTHCHECK.
    const dockerfile = `# ---- Base ----
FROM node:18-alpine AS base
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package manifests first for better docker cache usage
COPY package*.json ./

# ---- Prod deps ----
RUN npm ci --only=production

# ---- App source ----
COPY . .

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

# Default port (match your app's PORT usage)
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
`;

    await fs.writeFile(dockerfilePath, dockerfile);
    this.emitBuildLog(projectId, 'success', 'Dockerfile created');
  }

  /**
   * Build image and stream logs.
   */
  async buildImage(projectPath, imageName, projectId) {
    this.emitBuildLog(projectId, 'info', `Building Docker image: ${imageName}`);

    return new Promise((resolve, reject) => {
      const buildOptions = { t: imageName };
      this.docker.buildImage(
        { context: projectPath, src: ['.'] },
        buildOptions,
        (err, stream) => {
          if (err) return reject(err);

          stream.on('data', (chunk) => {
            const text = chunk.toString();
            // Docker emits line-delimited JSON during build; parse where possible
            text.split('\n').forEach((line) => {
              const trimmed = line.trim();
              if (!trimmed) return;
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.stream) this.emitBuildLog(projectId, 'info', parsed.stream.trim());
                if (parsed.error) this.emitBuildLog(projectId, 'error', parsed.error.trim());
              } catch {
                // Non-JSON line; show meaningful snippets
                if (trimmed.includes('Step') || trimmed.includes('Successfully')) {
                  this.emitBuildLog(projectId, 'info', trimmed);
                }
              }
            });
          });

          stream.on('end', () => {
            this.emitBuildLog(projectId, 'success', 'Docker image built successfully');
            resolve();
          });

          stream.on('error', (error) => {
            this.emitBuildLog(projectId, 'error', `Build failed: ${error.message}`);
            reject(error);
          });
        }
      );
    });
  }

  /**
   * Stop & remove an existing container for this project.
   */
  async stopExistingContainer(projectId) {
    try {
      const name = `project-${projectId}`;
      const containers = await this.docker.listContainers({ all: true });
      const existing = containers.find((c) => c.Names?.some((n) => n.includes(name)));

      if (existing) {
        this.emitBuildLog(projectId, 'info', 'Stopping existing container…');
        const container = this.docker.getContainer(existing.Id);
        // If running, stop with a 10s timeout
        if (existing.State === 'running') {
          await container.stop({ t: 10 });
        }
        await container.remove({ force: true });
        this.emitBuildLog(projectId, 'success', 'Existing container stopped and removed');
      }
    } catch (error) {
      this.emitBuildLog(projectId, 'error', `Error stopping existing container: ${error.message}`);
      // Don’t throw; best-effort cleanup
    }
  }

  /**
   * Create & start container on the next available host port.
   */
  async runContainer({ imageName, projectId, envVars = {} }) {
    // Assign a host port (what Nginx will proxy to)
    const hostPort = await this.getNextAvailablePort();

    this.emitBuildLog(projectId, 'info', `Starting container on host port ${hostPort}`);

    // Prepare env array: app env + enforced PORT=3000 inside container
    const Env = [
      ...Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
      'PORT=3000',
      // Helpful in-app metadata
      `PROJECT_ID=${projectId}`,
    ];

    const Labels = {
      'deployflow.project.id': String(projectId),
      'deployflow.port': String(hostPort),
      'deployflow.managed': 'true',
    };

    const containerConfig = {
      Image: imageName,
      name: `project-${projectId}`,
      Env,
      ExposedPorts: { '3000/tcp': {} },
      HostConfig: {
        PortBindings: { '3000/tcp': [{ HostPort: String(hostPort) }] },
        RestartPolicy: { Name: 'unless-stopped' },
        // Conservative resource limits; tweak per your box
        Memory: 512 * 1024 * 1024, // 512MB
        CpuShares: 512,
      },
      Labels,
    };

    const container = await this.docker.createContainer(containerConfig);
    await container.start();

    this.emitBuildLog(projectId, 'info', 'Container started, waiting for readiness…');
    await this.waitForReadiness(container, projectId);

    return {
      containerId: container.id,
      port: hostPort,
      // For local debug; your deploymentService builds the public URL
      deployUrl: `http://localhost:${hostPort}`,
    };
  }

  /**
   * Wait for the container to be running and (best-effort) healthy.
   * If HEALTHCHECK exists, Docker populates State.Health.
   */
  async waitForReadiness(container, projectId, maxWaitMs = 60_000) {
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      try {
        const info = await container.inspect();

        if (!info.State.Running) {
          const logs = await container.logs({ stdout: true, stderr: true, tail: 50 });
          throw new Error(`Container exited early.\nLogs:\n${logs.toString()}`);
        }

        // If health exists, prefer it
        if (info.State.Health && info.State.Health.Status) {
          const status = info.State.Health.Status; // starting | healthy | unhealthy
          this.emitBuildLog(projectId, 'info', `Health: ${status}`);
          if (status === 'healthy') return;
          if (status === 'unhealthy') {
            const logs = await container.logs({ stdout: true, stderr: true, tail: 80 });
            throw new Error(`Healthcheck failed.\nLogs:\n${logs.toString()}`);
          }
        } else {
          // No healthcheck: small grace period then assume up
          await this.sleep(2000);
          return;
        }

        await this.sleep(2000);
      } catch (err) {
        if (/exited early|Healthcheck failed/i.test(err.message)) throw err;
        await this.sleep(1000);
      }
    }
    throw new Error('Container readiness timeout');
  }

  async getNextAvailablePort() {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const used = new Set(
        containers
          .map((c) => c.Labels?.['deployflow.port'])
          .filter(Boolean)
          .map((p) => parseInt(p, 10))
      );

      // Also consider host bindings that might not have our label (other containers)
      containers.forEach((c) => {
        (c.Ports || []).forEach((p) => {
          if (p.PublicPort) used.add(p.PublicPort);
        });
      });

      while (used.has(this.portCounter)) this.portCounter++;
      return this.portCounter++;
    } catch (error) {
      // Best effort fallback
      this.portCounter++;
      return this.portCounter - 1;
    }
  }

  async stopContainer(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 10 });
      await container.remove({ force: true });
    } catch (error) {
      this.emitBuildLog(null, 'error', `Failed to stop container ${containerId}: ${error.message}`);
    }
  }

  async getContainerLogs(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: 200,
      });
      return logs.toString();
    } catch (error) {
      return '';
    }
  }

  async getContainerStatus(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      return {
        running: info.State.Running,
        status: info.State.Status,
        startedAt: info.State.StartedAt,
        health: info.State.Health?.Status || 'unknown',
      };
    } catch {
      return { running: false, status: 'unknown', health: 'unknown' };
    }
  }

  emitBuildLog(projectId, level, message) {
    // deploymentService sets global.deploymentService = this
    if (global.deploymentService) {
      // use projectId when provided; otherwise emit generic (won’t crash)
      try {
        if (projectId) {
          global.deploymentService.emitLog(projectId, level, message);
        } else {
          // No project id available; you could log to stdout as fallback
          // eslint-disable-next-line no-console
          console.log(`[${level}] ${message}`);
        }
      } catch {
        // ignore
      }
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export const dockerService = new DockerService();

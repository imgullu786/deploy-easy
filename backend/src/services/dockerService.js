import Docker from 'dockerode';
import { promises as fs } from 'fs';
import path from 'path';

class DockerService {
  constructor() {
    this.docker = new Docker();
    this.portCounter = 3001; // Start from 3001 to avoid conflicts
  }

  async buildAndDeploy(projectPath, projectId, envVars = {}) {
    try {
      // Create Dockerfile if it doesn't exist
      await this.ensureDockerfile(projectPath);

      // Build Docker image
      const imageName = `project-${projectId}:latest`;
      await this.buildImage(projectPath, imageName, projectId);

      // Stop existing container if it exists
      await this.stopExistingContainer(projectId);

      // Run container with environment variables
      const containerInfo = await this.runContainer(imageName, projectId, envVars);

      return containerInfo;
    } catch (error) {
      throw new Error(`Docker deployment failed: ${error.message}`);
    }
  }

  async ensureDockerfile(projectPath) {
    const dockerfilePath = path.join(projectPath, 'Dockerfile');
    
    try {
      await fs.access(dockerfilePath);
      this.emitBuildLog('info', 'Using existing Dockerfile');
    } catch {
      // Create default Dockerfile for Node.js apps
      this.emitBuildLog('info', 'Creating default Dockerfile for Node.js application');
      
      const dockerfile = `FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["npm", "start"]`;

      await fs.writeFile(dockerfilePath, dockerfile);
      this.emitBuildLog('success', 'Dockerfile created');
    }
  }

  async buildImage(projectPath, imageName, projectId) {
    this.emitBuildLog('info', `Building Docker image: ${imageName}`);
    
    return new Promise((resolve, reject) => {
      const buildOptions = {
        t: imageName,
      };

      this.docker.buildImage({
        context: projectPath,
        src: ['.'],
      }, buildOptions, (err, stream) => {
        if (err) return reject(err);

        let buildOutput = '';
        
        stream.on('data', (chunk) => {
          const data = chunk.toString();
          buildOutput += data;
          
          // Parse Docker build output and emit logs
          try {
            const lines = data.split('\n').filter(line => line.trim());
            lines.forEach(line => {
              if (line.trim()) {
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.stream) {
                    this.emitBuildLog('info', parsed.stream.trim());
                  }
                } catch {
                  // Not JSON, emit as is if it's meaningful
                  if (line.includes('Step') || line.includes('Successfully')) {
                    this.emitBuildLog('info', line.trim());
                  }
                }
              }
            });
          } catch (parseError) {
            console.error('Error parsing build output:', parseError);
          }
        });

        stream.on('end', () => {
          this.emitBuildLog('success', 'Docker image built successfully');
          resolve(buildOutput);
        });
        
        stream.on('error', (error) => {
          this.emitBuildLog('error', `Build failed: ${error.message}`);
          reject(error);
        });
      });
    });
  }

  async stopExistingContainer(projectId) {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const existingContainer = containers.find(container => 
        container.Names.some(name => name.includes(`project-${projectId}`))
      );

      if (existingContainer) {
        this.emitBuildLog('info', 'Stopping existing container...');
        const container = this.docker.getContainer(existingContainer.Id);
        
        if (existingContainer.State === 'running') {
          await container.stop({ t: 10 });
        }
        await container.remove();
        this.emitBuildLog('success', 'Existing container stopped and removed');
      }
    } catch (error) {
      console.error('Error stopping existing container:', error);
    }
  }

  async runContainer(imageName, projectId, envVars = {}) {
    // Get next available port
    const hostPort = await this.getNextAvailablePort();
    
    this.emitBuildLog('info', `Starting container on port ${hostPort}`);
    
    // Prepare environment variables
    const envArray = Object.entries(envVars).map(([key, value]) => `${key}=${value}`);
    
    // Add default PORT environment variable
    envArray.push(`PORT=3000`);

    if (Object.keys(envVars).length > 0) {
      this.emitBuildLog('info', `Environment variables: ${Object.keys(envVars).join(', ')}`);
    }

    const containerConfig = {
      Image: imageName,
      name: `project-${projectId}`,
      Env: envArray,
      ExposedPorts: { '3000/tcp': {} },
      HostConfig: {
        PortBindings: {
          '3000/tcp': [{ HostPort: hostPort.toString() }]
        },
        RestartPolicy: {
          Name: 'unless-stopped',
        },
        Memory: 512 * 1024 * 1024, // 512MB limit
        CpuShares: 512, // CPU limit
      },
      Labels: {
        'deployflow.project.id': projectId,
        'deployflow.port': hostPort.toString(),
      },
    };

    const container = await this.docker.createContainer(containerConfig);
    await container.start();

    this.emitBuildLog('info', 'Container started, waiting for health check...');

    // Wait for container to be ready
    await this.waitForContainer(container, projectId);

    return {
      containerId: container.id,
      port: hostPort,
      deployUrl: `http://localhost:${hostPort}`, // In production, this would be your domain
    };
  }

  async waitForContainer(container, projectId, maxWait = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const containerInfo = await container.inspect();
        
        if (!containerInfo.State.Running) {
          // Get container logs to see what went wrong
          const logs = await container.logs({
            stdout: true,
            stderr: true,
            tail: 20,
          });
          throw new Error(`Container failed to start. Logs: ${logs.toString()}`);
        }

        // Container is running, give it a moment to start the app
        await new Promise(resolve => setTimeout(resolve, 2000));
        this.emitBuildLog('success', 'Container is running and ready');
        return;
        
      } catch (error) {
        if (error.message.includes('Container failed to start')) {
          throw error;
        }
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('Container health check timeout');
  }

  async getNextAvailablePort() {
    try {
      const containers = await this.docker.listContainers();
      const usedPorts = containers
        .filter(container => container.Labels && container.Labels['deployflow.port'])
        .map(container => parseInt(container.Labels['deployflow.port']));
      
      while (usedPorts.includes(this.portCounter)) {
        this.portCounter++;
      }
      
      return this.portCounter++;
    } catch (error) {
      console.error('Error checking ports:', error);
      return this.portCounter++;
    }
  }

  async stopContainer(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 10 }); // 10 second timeout
      await container.remove();
    } catch (error) {
      console.error('Failed to stop container:', error);
    }
  }

  async getContainerLogs(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: 100, // Last 100 lines
      });
      return logs.toString();
    } catch (error) {
      console.error('Failed to get container logs:', error);
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
      };
    } catch (error) {
      console.error('Failed to get container status:', error);
      return { running: false, status: 'unknown' };
    }
  }

  emitBuildLog(level, message) {
    // This will be called from deploymentService
    if (global.deploymentService && this.currentProjectId) {
      global.deploymentService.emitLog(this.currentProjectId, level, message);
    }
  }

  setCurrentProjectId(projectId) {
    this.currentProjectId = projectId;
  }
}

export const dockerService = new DockerService();
import Docker from 'dockerode';
import { promises as fs } from 'fs';
import path from 'path';

class DockerService {
  constructor() {
    this.docker = new Docker();
  }

  async buildAndDeploy(projectPath, projectId) {
    try {
      // Create Dockerfile if it doesn't exist
      await this.ensureDockerfile(projectPath);

      // Build Docker image
      const imageName = `project-${projectId}:latest`;
      await this.buildImage(projectPath, imageName);

      // Run container
      const containerId = await this.runContainer(imageName, projectId);

      return containerId;
    } catch (error) {
      throw new Error(`Docker deployment failed: ${error.message}`);
    }
  }

  async ensureDockerfile(projectPath) {
    const dockerfilePath = path.join(projectPath, 'Dockerfile');
    
    try {
      await fs.access(dockerfilePath);
    } catch {
      // Create default Dockerfile for Node.js apps
      const dockerfile = `
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
      `.trim();

      await fs.writeFile(dockerfilePath, dockerfile);
    }
  }

  async buildImage(projectPath, imageName) {
    return new Promise((resolve, reject) => {
      const buildOptions = {
        t: imageName,
      };

      this.docker.buildImage({
        context: projectPath,
        src: ['.'],
      }, buildOptions, (err, stream) => {
        if (err) return reject(err);

        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
    });
  }

  async runContainer(imageName, projectId) {
    const container = await this.docker.createContainer({
      Image: imageName,
      name: `project-${projectId}`,
      ExposedPorts: { '3000/tcp': {} },
      HostConfig: {
        PortBindings: {
          '3000/tcp': [{ HostPort: '0' }] // Dynamic port assignment
        },
        RestartPolicy: {
          Name: 'unless-stopped',
        },
      },
      Labels: {
        'deployflow.project.id': projectId,
      },
    });

    await container.start();
    return container.id;
  }

  async stopContainer(containerId) {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop();
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
      });
      return logs.toString();
    } catch (error) {
      console.error('Failed to get container logs:', error);
      return '';
    }
  }
}

export const dockerService = new DockerService();
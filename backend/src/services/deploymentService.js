// deploymentService.js
import simpleGit from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import Project from '../models/Project.js';
import { s3Service } from './s3Service.js';
import { dockerService } from './dockerService.js';
import { io } from '../server.js';

const execAsync = promisify(exec);

// You can override these with environment variables if needed
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'gulamgaush.in';
const LE_FULLCHAIN = process.env.LE_FULLCHAIN || `/etc/letsencrypt/live/${BASE_DOMAIN}-0001/fullchain.pem`;
const LE_PRIVKEY  = process.env.LE_PRIVKEY  || `/etc/letsencrypt/live/${BASE_DOMAIN}-0001/privkey.pem`;
const LE_OPTIONS   = process.env.LE_OPTIONS  || '/etc/letsencrypt/options-ssl-nginx.conf';
const LE_DHPARAM   = process.env.LE_DHPARAM  || '/etc/letsencrypt/ssl-dhparams.pem';

class DeploymentService {
  constructor() {
    this.tempDir = '/tmp/deployments';
    this.ensureTempDir();
    global.deploymentService = this; // Make service accessible to dockerService
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  async deploy(project) {
    const deploymentId = project.name || uuidv4();
    const projectPath = path.join(this.tempDir, deploymentId);

    try {
      // Update project status
      await this.updateProjectStatus(project._id, 'deploying');
      this.emitLog(project._id, 'info', 'Starting deployment...');

      // Clone repository
      await this.cloneRepository(project.githubRepo, projectPath, project._id);

      // Use the build type specified by the user
      const buildType = project.buildType || 'static';
      this.emitLog(project._id, 'info', `Deploying as ${buildType} application`);

      let deployUrl, s3Path, containerId, port;

      if (buildType === 'static') {
        // Static deployment: build and upload to S3
        await this.buildStaticProject(projectPath, project._id, project);
        const result = await this.deployStatic(projectPath, project._id, project);
        deployUrl = result.deployUrl;
        s3Path = result.s3Path;
        this.emitLog(project._id, 'success', 'Static site deployed successfully');
      } else {
        // Server app → Docker container + Nginx mapping
        const result = await this.deployServer(projectPath, project._id, project);
        deployUrl = result.deployUrl;
        containerId = result.containerId;
        port = result.port;
        this.emitLog(project._id, 'success', 'Server application deployed successfully');
      }

      // Update project with deployment info
      await this.updateProjectDeployment(project._id, {
        status: 'running',
        deployUrl,
        s3Path,
        containerId,
        buildType,
        port,
        completedAt: new Date(),
      });

      this.emitLog(project._id, 'success', `Deployment complete! Available at ${deployUrl}`);
      await this.updateProjectStatus(project._id, 'running');
    } catch (error) {
      console.error('Deployment failed:', error);
      await this.updateProjectStatus(project._id, 'failed');
      this.emitLog(project._id, 'error', `Deployment failed: ${error.message}`);
    } finally {
      await this.cleanupTemp(projectPath);
    }
  }

  async cloneRepository(repoUrl, targetPath, projectId) {
    this.emitLog(projectId, 'info', `Cloning repository from ${repoUrl}...`);
    const git = simpleGit();
    await git.clone(repoUrl, targetPath);
    this.emitLog(projectId, 'success', 'Repository cloned successfully');
  }

  async buildStaticProject(projectPath, projectId, project) {
    const { rootDirectory, buildCommand } = project.buildConfig;
    const workingDir = path.join(projectPath, rootDirectory);

    this.emitLog(projectId, 'info', `Working in directory: ${rootDirectory}`);
    this.emitLog(projectId, 'info', 'Installing dependencies...');

    try {
      await execAsync('npm install', { cwd: workingDir });
      this.emitLog(projectId, 'success', 'Dependencies installed');
      this.emitLog(projectId, 'info', `Running build command: ${buildCommand}`);
      await execAsync(buildCommand, { cwd: workingDir });
      this.emitLog(projectId, 'success', 'Static build completed successfully');
    } catch (error) {
      throw new Error(`Static build failed: ${error.message}`);
    }
  }

  async deployStatic(projectPath, projectId, project) {
    this.emitLog(projectId, 'info', 'Uploading static files to S3...');

    const { rootDirectory, publishDirectory } = project.buildConfig;
    const workingDir = path.join(projectPath, rootDirectory);
    const distPath = path.join(workingDir, publishDirectory);
    const s3Path = `projects/${project.subDomain}`;

    try {
      // Check if build directory exists
      await fs.access(distPath);
      await s3Service.uploadStaticSite(distPath, s3Path);
      this.emitLog(projectId, 'success', 'Static files uploaded to S3');
      const deployUrl = `https://${project.subDomain}.${BASE_DOMAIN || 'gulamgaush.in'}`;
      return { deployUrl, s3Path };
    } catch (error) {
      throw new Error(`Static deployment failed: ${error.message}`);
    }
  }

  async deployServer(projectPath, projectId, project) {
    this.emitLog(projectId, 'info', 'Building Docker container for server deployment...');

    try {
      // Prepare env vars
      const envVars = {};
      if (project.envVars instanceof Map) {
        for (let [key, value] of project.envVars) envVars[key] = value;
      } else if (project.envVars && typeof project.envVars === 'object') {
        Object.assign(envVars, project.envVars);
      }

      this.emitLog(projectId, 'info', `Environment variables configured: ${Object.keys(envVars).length} variables`);

      const result = await dockerService.buildAndDeploy(projectPath, projectId, envVars);
      const deployUrl = `https://${project.subDomain}.${BASE_DOMAIN}`;

      // Write exact Nginx 80->443 + 443 proxy config
      await this.configureNginx(project.subDomain, result.port);

      return {
        deployUrl,
        containerId: result.containerId,
        port: result.port,
      };
    } catch (error) {
      throw new Error(`Server deployment failed: ${error.message}`);
    }
  }

  /**
   * Create an exact server_name config for this subdomain with:
   * - HTTP (80) redirect → HTTPS
   * - HTTPS (443) proxy → 127.0.0.1:<port>
   *
   * Writes to /tmp first, then sudo mv → /etc/nginx/sites-available, ln -sf to sites-enabled,
   * nginx -t, and reload.
   */
  async configureNginx(subDomain, port) {
    const serverName = `${subDomain}.${BASE_DOMAIN}`;
    const tmpPath     = `/tmp/${serverName}.conf`;
    const availPath   = `/etc/nginx/sites-available/${serverName}.conf`;
    const enabledPath = `/etc/nginx/sites-enabled/${serverName}.conf`;

    const nginxConfig = `
# Exact site for ${serverName}
# Ensures this app overrides the wildcard S3 server for the same subdomain

server {
    listen 80;
    server_name ${serverName};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${serverName};

    ssl_certificate ${LE_FULLCHAIN};
    ssl_certificate_key ${LE_PRIVKEY};
    include ${LE_OPTIONS};
    ssl_dhparam ${LE_DHPARAM};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
`.trimStart();

    try {
      // Write to /tmp as non-root
      await fs.writeFile(tmpPath, nginxConfig, { mode: 0o644 });

      // Move into place, enable, test, reload (needs sudoers)
      await execAsync(`sudo mv ${tmpPath} ${availPath}`);
      await execAsync(`sudo ln -sf ${availPath} ${enabledPath}`);
      await execAsync('sudo nginx -t');
      await execAsync('sudo systemctl reload nginx');

      this.emitLog(subDomain, 'success', `Nginx configured for ${serverName} → 127.0.0.1:${port}`);
    } catch (error) {
      this.emitLog(subDomain, 'error', `Failed to configure Nginx: ${error.message}`);
      throw error;
    }
  }

  async updateProjectStatus(projectId, status) {
    await Project.findByIdAndUpdate(projectId, { status });
    io.to(`project-${projectId}`).emit('deployment-status', { status });
  }

  async updateProjectDeployment(projectId, deploymentData) {
    const updateData = {
      status: deploymentData.status,
      deployUrl: deploymentData.deployUrl,
      buildType: deploymentData.buildType,
      currentDeployment: {
        ...deploymentData,
        version: new Date().toISOString(),
      },
    };

    if (deploymentData.s3Path) updateData.s3Path = deploymentData.s3Path;
    if (deploymentData.containerId) updateData.containerId = deploymentData.containerId;

    await Project.findByIdAndUpdate(projectId, updateData);
  }

  emitLog(projectId, level, message) {
    const logData = { timestamp: new Date(), level, message };
    io.to(`project-${projectId}`).emit('deployment-log', logData);
    this.saveLogToDatabase(projectId, logData);
  }

  async saveLogToDatabase(projectId, logData) {
    try {
      await Project.findByIdAndUpdate(projectId, { $push: { 'currentDeployment.logs': logData } });
    } catch (error) {
      console.error('Failed to save log to database:', error);
    }
  }

  async cleanupTemp(projectPath) {
    try {
      await fs.rm(projectPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up temp files:', error);
    }
  }

  async cleanup(project) {
    if (project.buildType === 'static' && project.currentDeployment.s3Path) {
      this.emitLog(project._id, 'info', 'Cleaning up S3 files...');
      await s3Service.deleteFiles(project.currentDeployment.s3Path);
    }
    if (project.buildType === 'server' && project.containerId) {
      this.emitLog(project._id, 'info', 'Stopping Docker container...');
      await dockerService.stopContainer(project.containerId);
    }
  }
}

export const deploymentService = new DeploymentService();

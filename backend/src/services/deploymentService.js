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

class DeploymentService {
  constructor() {
    this.tempDir = '/tmp/deployments';
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  async deploy(project) {
    const deploymentId = project.subDomain;
    const projectPath = path.join(this.tempDir, deploymentId);

    try {
      // Update project status
      await this.updateProjectStatus(project._id, 'deploying');
      this.emitLog(project._id, 'info', 'Starting deployment...');

      // Clone repository
      await this.cloneRepository(project.githubRepo, projectPath, project._id);

      // Use the build type specified by the user
      const buildType = project.buildType;
      this.emitLog(project._id, 'info', `Building as ${buildType} application`);

      // Build project
      await this.buildProject(projectPath, project._id);

      let deployUrl, s3Path;
      if (buildType === 'static') {
        // Deploy static files to S3
        const result = await this.deployStatic(projectPath, project._id, project);
        deployUrl = result.deployUrl;
        s3Path = result.s3Path;
      } else {
        // Deploy as Docker container
        deployUrl = await this.deployServer(projectPath, project._id);
      }

      // Update project with deployment info
      await this.updateProjectDeployment(project._id, {
        status: 'running',
        deployUrl,
        s3Path,
        buildType,
        completedAt: new Date(),
      });

      this.emitLog(project._id, 'success', `Deployment successful! Available at ${deployUrl}`);
      await this.updateProjectStatus(project._id, 'running');

    } catch (error) {
      console.error('Deployment failed:', error);
      await this.updateProjectStatus(project._id, 'failed');
      this.emitLog(project._id, 'error', `Deployment failed: ${error.message}`);
    } finally {
      // Clean up temporary files
      await this.cleanupTemp(projectPath);
    }
  }

  async cloneRepository(repoUrl, targetPath, projectId) {
    this.emitLog(projectId, 'info', `Cloning repository from ${repoUrl}...`);
    
    const git = simpleGit();
    await git.clone(repoUrl, targetPath);
    
    this.emitLog(projectId, 'success', 'Repository cloned successfully');
  }

  async buildProject(projectPath, projectId) {
    const project = await Project.findById(projectId);
    const { rootDirectory, buildCommand } = project.buildConfig;
    
    const workingDir = path.join(projectPath, rootDirectory);
    
    this.emitLog(projectId, 'info', `Working in directory: ${rootDirectory}`);
    this.emitLog(projectId, 'info', 'Installing dependencies...');
    
    try {
      await execAsync('npm install', { cwd: workingDir });
      this.emitLog(projectId, 'success', 'Dependencies installed');

      this.emitLog(projectId, 'info', `Running build command: ${buildCommand}`);
      await execAsync(buildCommand, { cwd: workingDir });
      this.emitLog(projectId, 'success', 'Project built successfully');
    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  async deployStatic(projectPath, projectId, project) {
    this.emitLog(projectId, 'info', 'Deploying static files to S3...');

    const { rootDirectory, publishDirectory } = project.buildConfig;
    const workingDir = path.join(projectPath, rootDirectory);
    const distPath = path.join(workingDir, publishDirectory);
    const s3Path = `projects/${project.subDomain}`;

    try {
      await s3Service.uploadStaticSite(distPath, s3Path);
      this.emitLog(projectId, 'success', 'Static files deployed successfully');
      const deployUrl = `https://${project.subDomain}.${process.env.BASE_DOMAIN}`;
      return { deployUrl, s3Path };
    } catch (error) {
      throw new Error(`Static deployment failed: ${error.message}`);
    }
  }

  async deployServer(projectPath, projectId) {
    this.emitLog(projectId, 'info', 'Building and deploying Docker container...');

    try {
      const containerId = await dockerService.buildAndDeploy(projectPath, projectId);
      const deployUrl = `https://${projectId}.${process.env.BASE_DOMAIN}`;
      this.emitLog(projectId, 'success', 'Container deployed successfully');
      return deployUrl;
    } catch (error) {
      throw new Error(`Container deployment failed: ${error.message}`);
    }
  }

  async updateProjectStatus(projectId, status) {
    await Project.findByIdAndUpdate(projectId, { status });
    io.to(`project-${projectId}`).emit('deployment-status', { status });
  }

  async updateProjectDeployment(projectId, deploymentData) {
    await Project.findByIdAndUpdate(projectId, {
      s3Path: deploymentData.s3Path,
      status: deploymentData.status,
      deployUrl: deploymentData.deployUrl,
      buildType: deploymentData.buildType,
      currentDeployment: {
        ...deploymentData,
        version: new Date().toISOString(),
      },
    });
  }

  emitLog(projectId, level, message) {
    const logData = {
      timestamp: new Date(),
      level,
      message,
    };

    // Emit to connected clients
    io.to(`project-${projectId}`).emit('deployment-log', logData);

    // Save to database
    this.saveLogToDatabase(projectId, logData);
  }

  async saveLogToDatabase(projectId, logData) {
    try {
      await Project.findByIdAndUpdate(projectId, {
        $push: { 'currentDeployment.logs': logData },
      });
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
    // Clean up S3 files
    if (project.buildType === 'static' && project.currentDeployment?.s3Path) {
      await s3Service.deleteFiles(project.currentDeployment.s3Path);
    }

    // Stop and remove Docker container
    if (project.buildType === 'server' && project.currentDeployment?.containerId) {
      await dockerService.stopContainer(project.currentDeployment.containerId);
    }
  }
}

export const deploymentService = new DeploymentService();
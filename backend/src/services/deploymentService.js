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
    const deploymentId = project.name;
    const projectPath = path.join(this.tempDir, deploymentId);

    try {
      // Update project status
      await this.updateProjectStatus(project._id, 'deploying');
      this.emitLog(project._id, 'info', 'Starting deployment...');

      // Clone repository
      await this.cloneRepository(project.githubRepo, projectPath, project._id);

      // Detect build type
      const buildType = await this.detectBuildType(projectPath, project._id);
      
      // Update project with build type
      await Project.findByIdAndUpdate(project._id, { buildType });

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

  async detectBuildType(projectPath, projectId) {
    this.emitLog(projectId, 'info', 'Detecting project type...');

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

      // Check for static site indicators
      const isStatic = packageJson.scripts?.build && 
        (packageJson.dependencies?.react || 
         packageJson.dependencies?.vue || 
         packageJson.dependencies?.vite ||
         packageJson.devDependencies?.vite);

      const buildType = isStatic ? 'static' : 'server';
      this.emitLog(projectId, 'success', `Detected ${buildType} application`);
      
      return buildType;
    } catch (error) {
      this.emitLog(projectId, 'warn', 'Could not detect project type, defaulting to server');
      return 'server';
    }
  }

  async buildProject(projectPath, projectId) {
    this.emitLog(projectId, 'info', 'Installing dependencies...');
    
    try {
      await execAsync('npm install', { cwd: projectPath });
      this.emitLog(projectId, 'success', 'Dependencies installed');

      this.emitLog(projectId, 'info', 'Building project...');
      await execAsync('npm run build', { cwd: projectPath });
      this.emitLog(projectId, 'success', 'Project built successfully');
    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  async deployStatic(projectPath, projectId, project) {
    this.emitLog(projectId, 'info', 'Deploying static files to S3...');

    const distPath = path.join(projectPath, 'dist');
    const s3Path = `projects/${project.name}`;

    try {
      await s3Service.uploadStaticSite(distPath, s3Path);
      this.emitLog(projectId, 'success', 'Static files deployed successfully');
      const deployUrl = `https://${project.customDomain}.gulamgaush.in`;
      return { deployUrl, s3Path };
    } catch (error) {
      throw new Error(`Static deployment failed: ${error.message}`);
    }
  }

  async deployServer(projectPath, projectId) {
    this.emitLog(projectId, 'info', 'Building and deploying Docker container...');

    try {
      const containerId = await dockerService.buildAndDeploy(projectPath, projectId);
      const deployUrl = `https://${projectId}.deployflow.app`;
      
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
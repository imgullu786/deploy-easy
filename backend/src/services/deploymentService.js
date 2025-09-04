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
    // Make this service globally available for Docker service
    global.deploymentService = this;
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

      // Use the build type specified by the user
      const buildType = project.buildType || 'static';
      this.emitLog(project._id, 'info', `Deploying as ${buildType} application`);

      let deployUrl, s3Path, containerId;

      if (buildType === 'static') {
        // Static deployment: build and upload to S3
        await this.buildStaticProject(projectPath, project._id, project);
        const result = await this.deployStatic(projectPath, project._id, project);
        deployUrl = result.deployUrl;
        s3Path = result.s3Path;
        this.emitLog(project._id, 'success', 'Static site deployed successfully');
      } else {
        // Server deployment: build Docker container
        const result = await this.deployServer(projectPath, project._id, project);
        deployUrl = result.deployUrl;
        containerId = result.containerId;
        this.emitLog(project._id, 'success', 'Server application deployed successfully');
      }

      // Update project with deployment info
      await this.updateProjectDeployment(project._id, {
        status: 'running',
        deployUrl,
        s3Path,
        containerId,
        buildType,
        completedAt: new Date(),
      });

      this.emitLog(project._id, 'success', `Deployment complete! Available at ${deployUrl}`);
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
      
      const deployUrl = `https://${project.subDomain}.${process.env.BASE_DOMAIN || 'gulamgaush.in'}`;
      return { deployUrl, s3Path };
    } catch (error) {
      throw new Error(`Static deployment failed: ${error.message}`);
    }
  }

  async deployServer(projectPath, projectId, project) {
    this.emitLog(projectId, 'info', 'Building Docker container for server deployment...');

    try {
      // Convert environment variables to proper format
      const envVars = {};
      
      if (project.envVars) {
        if (project.envVars instanceof Map) {
          // Convert Map to object
          for (let [key, value] of project.envVars) {
            envVars[key] = value;
          }
        } else if (typeof project.envVars === 'object') {
          // Already an object
          Object.assign(envVars, project.envVars);
        }
      }

      this.emitLog(projectId, 'info', `Environment variables configured: ${Object.keys(envVars).length} variables`);
      
      const result = await dockerService.buildAndDeploy(projectPath, projectId, envVars);
      
      const deployUrl = `https://${project.subDomain}.${process.env.BASE_DOMAIN || 'gulamgaush.in'}`;
      
      return {
        deployUrl,
        containerId: result.containerId,
        port: result.port,
      };
    } catch (error) {
      throw new Error(`Server deployment failed: ${error.message}`);
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

    // Only set s3Path for static deployments
    if (deploymentData.s3Path) {
      updateData.s3Path = deploymentData.s3Path;
    }

    // Only set containerId for server deployments
    if (deploymentData.containerId) {
      updateData.containerId = deploymentData.containerId;
    }

    await Project.findByIdAndUpdate(projectId, updateData);
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
    // Clean up S3 files for static deployments
    if (project.buildType === 'static' && project.s3Path) {
      this.emitLog(project._id, 'info', 'Cleaning up S3 files...');
      await s3Service.deleteFiles(project.s3Path);
    }

    // Stop and remove Docker container for server deployments
    if (project.buildType === 'server' && project.containerId) {
      this.emitLog(project._id, 'info', 'Stopping Docker container...');
      await dockerService.stopContainer(project.containerId);
    }
  }
}

export const deploymentService = new DeploymentService();
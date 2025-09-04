import Project from '../models/Project.js';
import { deploymentService } from '../services/deploymentService.js';

export const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ owner: req.user._id })
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const createProject = async (req, res) => {
  try {
    const { name, description, githubRepo, subDomain, buildConfig, buildType, envVars } = req.body;

    // Check if subdomain is already taken
    const existingProject = await Project.findOne({ subDomain });
    if (existingProject) {
      return res.status(400).json({ message: 'Subdomain is already taken' });
    }
    const project = new Project({
      name,
      description,
      githubRepo,
      subDomain,
      buildConfig: buildConfig || {},
      buildType,
      envVars: envVars || new Map(),
      owner: req.user._id,
    });

    // Generate deployment URL
    project.deployUrl = project.generateDeployUrl();

    await project.save();
    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { name, description, githubRepo, subDomain, buildConfig, buildType, envVars } = req.body;

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { name, description, githubRepo, subDomain, buildConfig, buildType, envVars },
      { new: true, runValidators: true }
    );

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Clean up deployment resources
    await deploymentService.cleanup(project);

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deployProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Start deployment process
    deploymentService.deploy(project);

    res.json({ message: 'Deployment started', projectId: project._id });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getProjectLogs = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const logs = project.currentDeployment?.logs || [];
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
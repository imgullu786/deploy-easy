import mongoose from 'mongoose';

const deploymentSchema = new mongoose.Schema({
  version: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['deploying', 'running', 'failed', 'stopped'],
    default: 'deploying',
  },
  buildType: {
    type: String,
    enum: ['static', 'server'],
    required: true,
  },
  containerId: String,
  s3Path: String,
  deployUrl: String,
  startedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,
  logs: [{
    timestamp: {
      type: Date,
      default: Date.now,
    },
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'success'],
      default: 'info',
    },
    message: String,
  }],
});

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  githubRepo: {
    type: String,
    required: true,
    trim: true,
  },
  subDomain: {
  type: String,
  unique: true,
  trim: true,
},
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['idle', 'deploying', 'running', 'failed', 'stopped'],
    default: 'idle',
  },
  currentDeployment: deploymentSchema,
  deployments: [deploymentSchema],
  deployUrl: String,
  buildType: {
    type: String,
    enum: ['static', 'server'],
  },
}, {
  timestamps: true,
});

// Generate unique deployment URL
projectSchema.methods.generateDeployUrl = function() {
  const subdomain = this.subDomain;
  return `https://${subdomain}.${process.env.BASE_DOMAIN}`;
};

const Project = mongoose.model('Project', projectSchema);

export default Project;
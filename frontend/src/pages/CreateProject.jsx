import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Server, Globe, Github, Settings, Zap, XCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { projectService } from '../services/projectService';

const CreateProject = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    githubRepo: '',
    subDomain: '',
    description: '',
    buildType: 'static', // Default to static
    buildConfig: {
      rootDirectory: '.',
      buildCommand: 'npm run build',
      publishDirectory: 'dist',
    },
    // IMPORTANT: envVars is now an array with stable ids
    envVars: [], // [{ id, name, value }]
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ---------- handlers ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Convert envVars array -> object expected by backend
      const envVarsObject =
        formData.buildType === 'server'
          ? formData.envVars.reduce((acc, { name, value }) => {
              const key = (name || '').trim();
              if (key) acc[key] = value ?? '';
              return acc;
            }, {})
          : {};

      const payload = {
        ...formData,
        envVars: envVarsObject,
      };

      const newProject = await projectService.createProject(payload);
      navigate(`/project/${newProject._id}`);
    } catch (err) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name.startsWith('buildConfig.')) {
      const configKey = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        buildConfig: {
          ...prev.buildConfig,
          [configKey]: value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleTypeChange = (type) => {
    setFormData((prev) => ({
      ...prev,
      buildType: type,
      // Reset buildConfig based on type
      buildConfig:
        type === 'static'
          ? {
              rootDirectory: '.',
              buildCommand: 'npm run build',
              publishDirectory: 'dist',
            }
          : {
              rootDirectory: '.',
              buildCommand: 'npm start',
              publishDirectory: '.',
            },
      // Clear envVars when switching away from server to avoid confusion
      envVars: type === 'server' ? prev.envVars : [],
    }));
  };

  // ---------- env var helpers (array with stable ids) ----------
  const addEnvVar = () => {
    setFormData((prev) => ({
      ...prev,
      envVars: [
        ...prev.envVars,
        { id: uuidv4(), name: `ENV_VAR_${prev.envVars.length + 1}`, value: '' },
      ],
    }));
  };

  const removeEnvVar = (id) => {
    setFormData((prev) => ({
      ...prev,
      envVars: prev.envVars.filter((v) => v.id !== id),
    }));
  };

  const updateEnvVar = (id, patch) => {
    setFormData((prev) => ({
      ...prev,
      envVars: prev.envVars.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  };

  const addCommonEnvVar = (key, value = '') => {
    setFormData((prev) => {
      if (prev.envVars.some((v) => v.name === key)) return prev; // avoid duplicates
      return {
        ...prev,
        envVars: [...prev.envVars, { id: uuidv4(), name: key, value }],
      };
    });
  };

  const applyPreset = (preset) => {
    const presets = {
      'vite-react': {
        rootDirectory: '.',
        buildCommand: 'npm run build',
        publishDirectory: 'dist',
      },
      'create-react-app': {
        rootDirectory: '.',
        buildCommand: 'npm run build',
        publishDirectory: 'build',
      },
      'nextjs-static': {
        rootDirectory: '.',
        buildCommand: 'npm run build && npm run export',
        publishDirectory: 'out',
      },
      'monorepo-frontend': {
        rootDirectory: 'frontend',
        buildCommand: 'npm run build',
        publishDirectory: 'dist',
      },
      'express-server': {
        rootDirectory: '.',
        buildCommand: 'npm install', // installs prod deps in container or during build step
        publishDirectory: '.',
      },
      'nextjs-server': {
        rootDirectory: '.',
        buildCommand: 'npm run build',
        publishDirectory: '.',
      },
    };

    setFormData((prev) => ({
      ...prev,
      buildConfig: presets[preset],
    }));
  };

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-8">
          <Link
            to="/dashboard"
            className="flex items-center space-x-2 text-gray-600 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="h-6 w-px bg-gray-300"></div>
          <h1 className="text-3xl font-extrabold text-gray-900">Create New Project</h1>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 shadow-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Project Type Selection */}
          <div className="bg-white/90 backdrop-blur-xl p-6 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Project Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Static Site */}
              <div
                onClick={() => handleTypeChange('static')}
                className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
                  formData.buildType === 'static'
                    ? 'border-indigo-500 bg-indigo-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <Globe
                    className={`h-6 w-6 ${
                      formData.buildType === 'static' ? 'text-indigo-600' : 'text-gray-500'
                    }`}
                  />
                  <h3 className="text-lg font-semibold text-gray-900">Static Site</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  For React, Vue, Angular, or any static site that builds to HTML/CSS/JS files
                </p>
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Examples:</span> Vite, Create React App, Next.js Static Export
                </div>
              </div>

              {/* Server Application */}
              <div
                onClick={() => handleTypeChange('server')}
                className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
                  formData.buildType === 'server'
                    ? 'border-indigo-500 bg-indigo-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <Server
                    className={`h-6 w-6 ${
                      formData.buildType === 'server' ? 'text-indigo-600' : 'text-gray-500'
                    }`}
                  />
                  <h3 className="text-lg font-semibold text-gray-900">Server Application</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  For Node.js, Express, Next.js SSR, or any application that needs a running server
                </p>
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Examples:</span> Express API, Next.js SSR, Node.js Backend
                </div>
              </div>
            </div>
          </div>

          {/* Basic Information */}
          <div className="bg-white/90 backdrop-blur-xl p-6 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Project Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="my-awesome-app"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400"
                />
              </div>

              {/* Subdomain */}
              <div>
                <label htmlFor="subDomain" className="block text-sm font-semibold text-gray-700 mb-2">
                  Subdomain *
                </label>
                <input
                  type="text"
                  id="subDomain"
                  name="subDomain"
                  value={formData.subDomain}
                  onChange={handleChange}
                  required
                  placeholder="myapp"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available at: <strong>{formData.subDomain || 'your-app'}.gulamgaush.in</strong>
                </p>
              </div>
            </div>

            {/* GitHub Repository */}
            <div className="mt-6">
              <label htmlFor="githubRepo" className="block text-sm font-semibold text-gray-700 mb-2">
                GitHub Repository *
              </label>
              <div className="relative">
                <Github className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="url"
                  id="githubRepo"
                  name="githubRepo"
                  value={formData.githubRepo}
                  onChange={handleChange}
                  required
                  placeholder="https://github.com/username/repository"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400"
                />
              </div>
            </div>

            {/* Description */}
            <div className="mt-6">
              <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                Description (optional)
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="3"
                placeholder="Brief description of your project"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 resize-none"
              />
            </div>
          </div>

          {/* Build Configuration */}
          <div className="bg-white/90 backdrop-blur-xl p-6 rounded-xl shadow-lg border border-gray-200">
            <div className="flex items-center space-x-2 mb-4">
              <Settings className="h-5 w-5 text-indigo-600" />
              <h2 className="text-xl font-semibold text-gray-900">Build Configuration</h2>
            </div>

            {/* Quick Presets */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-3">Quick Presets</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {formData.buildType === 'static' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => applyPreset('vite-react')}
                      className="px-3 py-2 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors font-medium"
                    >
                      Vite/React
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('create-react-app')}
                      className="px-3 py-2 text-xs rounded-lg bg-cyan-100 text-cyan-700 hover:bg-cyan-200 transition-colors font-medium"
                    >
                      Create React App
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('nextjs-static')}
                      className="px-3 py-2 text-xs rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors font-medium"
                    >
                      Next.js Static
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('monorepo-frontend')}
                      className="px-3 py-2 text-xs rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors font-medium"
                    >
                      Monorepo
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => applyPreset('express-server')}
                      className="px-3 py-2 text-xs rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-medium"
                    >
                      Express
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('nextjs-server')}
                      className="px-3 py-2 text-xs rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors font-medium"
                    >
                      Next.js SSR
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Root Directory */}
              <div>
                <label htmlFor="rootDirectory" className="block text-sm font-semibold text-gray-700 mb-2">
                  Root Directory
                </label>
                <input
                  type="text"
                  id="rootDirectory"
                  name="buildConfig.rootDirectory"
                  value={formData.buildConfig.rootDirectory}
                  onChange={handleChange}
                  placeholder="."
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Directory containing package.json</p>
              </div>

              {/* Build/Start Command */}
              <div>
                <label htmlFor="buildCommand" className="block text-sm font-semibold text-gray-700 mb-2">
                  {formData.buildType === 'static' ? 'Build Command' : 'Start Command'}
                </label>
                <input
                  type="text"
                  id="buildCommand"
                  name="buildConfig.buildCommand"
                  value={formData.buildConfig.buildCommand}
                  onChange={handleChange}
                  placeholder={formData.buildType === 'static' ? 'npm run build' : 'npm start'}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.buildType === 'static'
                    ? 'Command to build your project'
                    : 'Command to start your server'}
                </p>
              </div>

              {/* Publish Directory (only for static) */}
              {formData.buildType === 'static' && (
                <div>
                  <label htmlFor="publishDirectory" className="block text-sm font-semibold text-gray-700 mb-2">
                    Publish Directory
                  </label>
                  <input
                    type="text"
                    id="publishDirectory"
                    name="buildConfig.publishDirectory"
                    value={formData.buildConfig.publishDirectory}
                    onChange={handleChange}
                    placeholder="dist"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Directory containing built files</p>
                </div>
              )}
            </div>

            {/* Build Type Info */}
            <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex items-start space-x-3">
                {formData.buildType === 'static' ? (
                  <Globe className="h-5 w-5 text-indigo-600 mt-0.5" />
                ) : (
                  <Server className="h-5 w-5 text-indigo-600 mt-0.5" />
                )}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">
                    {formData.buildType === 'static' ? 'Static Site Deployment' : 'Server Application Deployment'}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {formData.buildType === 'static'
                      ? 'Your project will be built and deployed as static files to S3 with CDN distribution.'
                      : 'Your project will be containerized with Docker and deployed as a running server application.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Environment Variables (only for server projects) */}
          {formData.buildType === 'server' && (
            <div className="bg-white/90 backdrop-blur-xl p-6 rounded-xl shadow-lg border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Settings className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Environment Variables</h2>
                </div>
                <button
                  type="button"
                  onClick={addEnvVar}
                  className="px-3 py-1.5 text-sm rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors font-medium"
                >
                  Add Variable
                </button>
              </div>

              {/* Common Environment Variables */}
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Quick Add Common Variables</p>
                <div className="flex flex-wrap gap-2">
                  {['NODE_ENV', 'PORT', 'DATABASE_URL', 'JWT_SECRET', 'API_KEY'].map((envKey) => (
                    <button
                      key={envKey}
                      type="button"
                      onClick={() => addCommonEnvVar(envKey)}
                      disabled={formData.envVars.some((v) => v.name === envKey)}
                      className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {envKey}
                    </button>
                  ))}
                </div>
              </div>

              {/* Environment Variables List */}
              <div className="space-y-3">
                {formData.envVars.map(({ id, name, value }) => (
                  <div key={id} className="flex items-center space-x-3">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => updateEnvVar(id, { name: e.target.value })}
                      placeholder="VARIABLE_NAME"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 font-mono text-sm"
                    />
                    <span className="text-gray-400 font-mono">=</span>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateEnvVar(id, { value: e.target.value })}
                      placeholder="value"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(id)}
                      className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {formData.envVars.length === 0 && (
                  <div className="text-center py-8 text-gray-505">
                    <Settings className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">No environment variables configured</p>
                    <p className="text-xs">Click "Add Variable" to add environment variables for your server</p>
                  </div>
                )}
              </div>

              {/* Environment Variables Info */}
              <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <div className="flex items-start space-x-3">
                  <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900 mb-1">Environment Variables</h4>
                    <p className="text-sm text-blue-700">
                      These variables will be available in your server application at runtime.
                      Common examples include database URLs, API keys, and configuration settings.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <Link
              to="/dashboard"
              className="px-6 py-3 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  <span>Create Project</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProject;

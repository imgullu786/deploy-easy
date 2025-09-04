import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Settings, Globe, Github, Trash2, Edit3, XCircle } from 'lucide-react';
import { projectService } from '../services/projectService';
import LogsPanel from '../components/LogsPanel';
import { io } from 'socket.io-client';

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);
  const [showBuildConfig, setShowBuildConfig] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [buildConfig, setBuildConfig] = useState({
    rootDirectory: '.',
    buildCommand: 'npm run build',
    publishDirectory: 'dist',
  });

  useEffect(() => {
    loadProject();
    loadLogs();
    
    // WebSocket for real-time logs
    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join-project', id);
    });

    newSocket.on('deployment-log', (logData) => {
      setLogs(prev => [...prev, logData]);
    });

    newSocket.on('deployment-status', (statusData) => {
      setProject(prev => prev ? { ...prev, status: statusData.status } : null);
      if (statusData.status !== 'deploying') {
        setDeploying(false);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [id]);

  const loadProject = async () => {
    try {
      const projectData = await projectService.getProject(id);
      setProject(projectData);
      setBuildConfig(projectData.buildConfig || {
        rootDirectory: '.',
        buildCommand: 'npm run build',
        publishDirectory: 'dist',
      });
    } catch (err) {
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const logsData = await projectService.getLogs(id);
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setError('');
    try {
      await projectService.deployProject(id);
      setProject(prev => ({ ...prev, status: 'deploying' }));
    } catch (err) {
      setError(err.message);
      setDeploying(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      try {
        await projectService.deleteProject(id);
        navigate('/dashboard');
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const handleSaveBuildConfig = async () => {
    try {
      const updatedProject = await projectService.updateProject(id, {
        ...project,
        buildConfig,
      });
      setProject(updatedProject);
      setEditingConfig(false);
      setError('');
    } catch (err) {
      setError('Failed to update build configuration');
    }
  };

  const handleBuildConfigChange = (field, value) => {
    setBuildConfig(prev => ({
      ...prev,
      [field]: value,
    }));
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-indigo-500"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Project not found</h2>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 px-6 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium shadow hover:scale-105 transition-transform"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center space-x-4 mb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center space-x-2 text-gray-600 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back</span>
        </button>
        <h1 className="text-3xl font-extrabold text-gray-900">{project.name}</h1>
        <div
          className={`px-3 py-1 rounded-full text-sm font-medium capitalize shadow ${
            project.status === 'running'
              ? 'bg-green-100 text-green-700'
              : project.status === 'deploying'
              ? 'bg-yellow-100 text-yellow-700 animate-pulse'
              : project.status === 'failed'
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          {project.status}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 shadow-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Project Details */}
        <div className="lg:col-span-2">
          <div className="bg-white/90 backdrop-blur-xl p-6 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Project Details</h2>
            <div className="space-y-5">
              <div className="flex items-center space-x-3">
                <Github className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-medium text-gray-700">GitHub Repository</p>
                  <a
                    href={project.githubRepo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-purple-600 text-sm font-medium transition-colors"
                  >
                    {project.githubRepo}
                  </a>
                </div>
              </div>

              {project.subDomain && (
                <div className="flex items-center space-x-3">
                  <Globe className="h-5 w-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Subdomain</p>
                    <p className="text-sm text-gray-600">{project.subDomain}.gulamgaush.in</p>
                  </div>
                </div>
              )}

              {project.deployUrl && (
                <div className="flex items-center space-x-3">
                  <Globe className="h-5 w-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Deployment URL</p>
                    <a
                      href={project.deployUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-purple-600 text-sm font-medium transition-colors"
                    >
                      {project.deployUrl}
                    </a>
                  </div>
                </div>
              )}

              {/* Build Configuration */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">Build Configuration</h3>
                  <button
                    onClick={() => setEditingConfig(!editingConfig)}
                    className="text-indigo-600 hover:text-purple-600 text-sm font-medium flex items-center space-x-1 transition-colors"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>{editingConfig ? 'Cancel' : 'Edit'}</span>
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Root Directory</p>
                    {editingConfig ? (
                      <input
                        type="text"
                        value={buildConfig.rootDirectory}
                        onChange={(e) => handleBuildConfigChange('rootDirectory', e.target.value)}
                        className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    ) : (
                      <p className="text-sm text-gray-800 font-mono bg-gray-50 px-2 py-1 rounded">
                        {project.buildConfig?.rootDirectory || '.'}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Build Command</p>
                    {editingConfig ? (
                      <input
                        type="text"
                        value={buildConfig.buildCommand}
                        onChange={(e) => handleBuildConfigChange('buildCommand', e.target.value)}
                        className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    ) : (
                      <p className="text-sm text-gray-800 font-mono bg-gray-50 px-2 py-1 rounded">
                        {project.buildConfig?.buildCommand || 'npm run build'}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Publish Directory</p>
                    {editingConfig ? (
                      <input
                        type="text"
                        value={buildConfig.publishDirectory}
                        onChange={(e) => handleBuildConfigChange('publishDirectory', e.target.value)}
                        className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    ) : (
                      <p className="text-sm text-gray-800 font-mono bg-gray-50 px-2 py-1 rounded">
                        {project.buildConfig?.publishDirectory || 'dist'}
                      </p>
                    )}
                  </div>
                  
                  {editingConfig && (
                    <div className="flex space-x-2 pt-2">
                      <button
                        onClick={handleSaveBuildConfig}
                        className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingConfig(false);
                          setBuildConfig(project.buildConfig || {
                            rootDirectory: '.',
                            buildCommand: 'npm run build',
                            publishDirectory: 'dist',
                          });
                        }}
                        className="px-3 py-1.5 text-sm rounded bg-gray-200 text-gray-700 font-medium hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Environment Variables (for server projects) */}
              {project.buildType === 'server' && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Environment Variables</h3>
                  {project.envVars && Object.keys(project.envVars).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(project.envVars).map(([key, value]) => (
                        <div key={key} className="flex items-center space-x-2 text-sm">
                          <span className="font-mono text-gray-800 bg-gray-100 px-2 py-1 rounded min-w-0 flex-shrink-0">
                            {key}
                          </span>
                          <span className="text-gray-400">=</span>
                          <span className="font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded truncate flex-1">
                            {value ? '••••••••' : '(empty)'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No environment variables configured</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <button
            onClick={handleDeploy}
            disabled={deploying || project.status === 'deploying'}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold flex items-center justify-center space-x-2 shadow-md hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="h-5 w-5" />
            <span>
              {deploying || project.status === 'deploying' ? 'Deploying...' : 'Deploy'}
            </span>
          </button>

          <button className="w-full py-2.5 rounded-lg bg-lime-400 text-gray-700 font-medium flex items-center justify-center space-x-2 hover:bg-yellow-200 transition-colors">
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </button>

          <button
            onClick={handleDelete}
            className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium flex items-center justify-center space-x-2 shadow-sm transition-colors"
          >
            <Trash2 className="h-5 w-5" />
            <span>Delete Project</span>
          </button>
        </div>
      </div>

      {/* Logs */}
      <LogsPanel logs={logs} isLoading={deploying || project.status === 'deploying'} />
    </div>
  );
};

export default ProjectDetail;

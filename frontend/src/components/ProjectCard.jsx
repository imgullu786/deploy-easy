import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Github, Globe, Activity, XCircle } from 'lucide-react';

const ProjectCard = ({ project }) => {
  const getStatusStyles = (status) => {
    switch (status) {
      case 'running':
        return {
          color: 'text-green-700',
          bg: 'bg-green-100',
          icon: <Activity className="h-4 w-4 text-green-600" />,
        };
      case 'deploying':
        return {
          color: 'text-yellow-700',
          bg: 'bg-yellow-100',
          icon: (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-600 border-t-transparent" />
          ),
        };
      case 'failed':
        return {
          color: 'text-red-700',
          bg: 'bg-red-100',
          icon: <XCircle className="h-4 w-4 text-red-600" />,
        };
      default:
        return {
          color: 'text-gray-700',
          bg: 'bg-gray-200',
          icon: <Activity className="h-4 w-4 text-gray-500" />,
        };
    }
  };

  const status = getStatusStyles(project.status);

  return (
    <div className="bg-white/90 backdrop-blur-xl p-6 rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-all hover:scale-[1.02]">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-2 truncate">{project.name}</h3>
          <div
            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color} shadow-sm`}
          >
            {status.icon}
            <span className="capitalize">{project.status}</span>
          </div>
        </div>
        <Link
          to={`/project/${project._id}`}
          className="text-indigo-600 hover:text-purple-600 transition-colors"
        >
          <ExternalLink className="h-5 w-5" />
        </Link>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4">
        {project.githubRepo && (
          <div className="flex items-center space-x-2 text-sm text-gray-700">
            <Github className="h-4 w-4 text-gray-500" />
            <span className="truncate">{project.githubRepo}</span>
          </div>
        )}
        {project.customDomain && (
          <div className="flex items-center space-x-2 text-sm text-gray-700">
            <Globe className="h-4 w-4 text-gray-500" />
            <span className="truncate">{project.customDomain}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-500">
        Created {new Date(project.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
};

export default ProjectCard;

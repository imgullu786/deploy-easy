import React, { useState } from 'react';
import { X } from 'lucide-react';

const CreateProjectModal = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    githubRepo: '',
    subDomain: '',
    description: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({
      name: '',
      githubRepo: '',
      subDomain: '',
      description: '',
    });
  };

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl border border-gray-200">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Create New Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Project Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-gray-700 mb-1"
            >
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
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 
                         focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 
                         outline-none transition-all placeholder-gray-400"
            />
          </div>

          {/* GitHub Repo */}
          <div>
            <label
              htmlFor="githubRepo"
              className="block text-sm font-semibold text-gray-700 mb-1"
            >
              GitHub Repository *
            </label>
            <input
              type="url"
              id="githubRepo"
              name="githubRepo"
              value={formData.githubRepo}
              onChange={handleChange}
              required
              placeholder="https://github.com/username/repo"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 
                         focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 
                         outline-none transition-all placeholder-gray-400"
            />
          </div>

          {/* Subdomain */}
          <div>
            <label
              htmlFor="subDomain"
              className="block text-sm font-semibold text-gray-700 mb-1"
            >
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
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 
                         focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 
                         outline-none transition-all placeholder-gray-400"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your project will be available at{" "}
              <strong>
                {formData.subDomain || "your-app"}.
                {import.meta.env.VITE_BASE_DOMAIN || "example.com"}
              </strong>
            </p>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-semibold text-gray-700 mb-1"
            >
              Description (optional)
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Brief description of your project"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 
                         focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 
                         outline-none transition-all placeholder-gray-400 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-700 font-medium 
                         hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 
                         text-white font-semibold shadow-md hover:shadow-lg 
                         hover:scale-[1.02] transition-all"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal;

const API_BASE = '/api';

class ProjectService {
  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getProjects() {
    const response = await fetch(`${API_BASE}/projects`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }

    return response.json();
  }

  async getProject(id) {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch project');
    }

    return response.json();
  }

  async createProject(projectData) {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(projectData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create project');
    }

    return response.json();
  }

  async updateProject(id, projectData) {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(projectData),
    });

    if (!response.ok) {
      throw new Error('Failed to update project');
    }

    return response.json();
  }

  async deployProject(id) {
    const response = await fetch(`${API_BASE}/projects/${id}/deploy`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to deploy project');
    }

    return response.json();
  }

  async deleteProject(id) {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete project');
    }

    return response.json();
  }

  async getLogs(projectId) {
    const response = await fetch(`${API_BASE}/projects/${projectId}/logs`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch logs');
    }

    return response.json();
  }
}

export const projectService = new ProjectService();
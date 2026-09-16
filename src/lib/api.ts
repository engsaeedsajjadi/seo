// RankForge API Service Layer
// This service handles all communication with the backend API
// In production, this connects to a real backend. When not configured, it shows proper states.

import type { 
  Organization, 
  Project, 
  AuditFinding, 
  Keyword, 
  RankingEntry, 
  Job, 
  Report, 
  Alert,
  ProviderStatus 
} from './types';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const API_TIMEOUT = 30000;

// API Client
class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = API_BASE_URL, timeout: number = API_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new ApiError(response.status, await response.text());
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(408, 'Request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Organization
  async getCurrentOrganization(): Promise<Organization | null> {
    try {
      return await this.request<Organization>('/api/v1/organizations/current');
    } catch {
      return null;
    }
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    try {
      const response = await this.request<{ data: Project[] }>('/api/v1/projects');
      return response.data;
    } catch {
      return [];
    }
  }

  async createProject(data: Partial<Project>): Promise<Project | null> {
    try {
      return await this.request<Project>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch {
      return null;
    }
  }

  async getProject(id: string): Promise<Project | null> {
    try {
      return await this.request<Project>(`/api/v1/projects/${id}`);
    } catch {
      return null;
    }
  }

  // Audit
  async getAuditFindings(projectId: string): Promise<AuditFinding[]> {
    try {
      const response = await this.request<{ data: AuditFinding[] }>(`/api/v1/projects/${projectId}/audit`);
      return response.data;
    } catch {
      return [];
    }
  }

  async runAudit(projectId: string): Promise<Job | null> {
    try {
      return await this.request<Job>(`/api/v1/projects/${projectId}/audit`, {
        method: 'POST',
      });
    } catch {
      return null;
    }
  }

  // Keywords
  async getKeywords(projectId: string): Promise<Keyword[]> {
    try {
      const response = await this.request<{ data: Keyword[] }>(`/api/v1/projects/${projectId}/keywords`);
      return response.data;
    } catch {
      return [];
    }
  }

  // Rankings
  async getRankings(projectId: string): Promise<RankingEntry[]> {
    try {
      const response = await this.request<{ data: RankingEntry[] }>(`/api/v1/projects/${projectId}/rankings`);
      return response.data;
    } catch {
      return [];
    }
  }

  // Jobs
  async getJobs(projectId: string): Promise<Job[]> {
    try {
      const response = await this.request<{ data: Job[] }>(`/api/v1/projects/${projectId}/jobs`);
      return response.data;
    } catch {
      return [];
    }
  }

  // Reports
  async getReports(projectId: string): Promise<Report[]> {
    try {
      const response = await this.request<{ data: Report[] }>(`/api/v1/projects/${projectId}/reports`);
      return response.data;
    } catch {
      return [];
    }
  }

  // Alerts
  async getAlerts(projectId: string): Promise<Alert[]> {
    try {
      const response = await this.request<{ data: Alert[] }>(`/api/v1/projects/${projectId}/alerts`);
      return response.data;
    } catch {
      return [];
    }
  }

  // Provider Status
  async getProviderStatus(): Promise<Record<string, ProviderStatus>> {
    try {
      return await this.request<Record<string, ProviderStatus>>('/api/v1/integrations/status');
    } catch {
      return {
        dataForSeo: 'not_configured',
        openai: 'not_configured',
        anthropic: 'not_configured',
        googleSearchConsole: 'not_configured',
        googleAnalytics: 'not_configured',
        stripe: 'not_configured',
        s3: 'not_configured',
      };
    }
  }
}

// API Error
export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`API Error ${status}: ${body}`);
    this.status = status;
    this.body = body;
    this.name = 'ApiError';
  }
}

// Export singleton instance
export const api = new ApiClient();

// Check if API is available
export async function checkApiAvailability(): Promise<boolean> {
  try {
    await api.getCurrentOrganization();
    return true;
  } catch {
    return false;
  }
}

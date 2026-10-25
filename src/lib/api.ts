// RankForge API Service Layer
// Production-ready API client with typed errors and proper state handling

import type { 
  Organization, 
  Project, 
  AuditFinding, 
  Keyword, 
  RankingEntry, 
  Job, 
  Report, 
  Alert,
  ProviderStatus,
  OrganizationMember
} from './types';

// ============================================================
// TYPED API ERRORS
// ============================================================

export enum ApiErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  
  // Authentication errors
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Authorization errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  
  // Rate limiting
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Provider errors
  PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  
  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Business logic
  LIMIT_REACHED = 'LIMIT_REACHED',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
}

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(code: ApiErrorCode, message: string, status: number = 0, details?: Record<string, unknown>, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export class NetworkError extends ApiError {
  constructor(message: string = 'Network error. Please check your connection.') {
    super(ApiErrorCode.NETWORK_ERROR, message, 0);
    this.name = 'NetworkError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required. Please sign in.') {
    super(ApiErrorCode.UNAUTHENTICATED, message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'You do not have permission to perform this action.') {
    super(ApiErrorCode.UNAUTHORIZED, message, 403);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ApiErrorCode.VALIDATION_ERROR, message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(ApiErrorCode.NOT_FOUND, `${resource} not found.`, 404);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends ApiError {
  retryAfter?: number;
  constructor(retryAfter?: number) {
    super(ApiErrorCode.RATE_LIMITED, 'Rate limit exceeded. Please try again later.', 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ProviderNotConfiguredError extends ApiError {
  provider: string;
  constructor(provider: string) {
    super(ApiErrorCode.PROVIDER_NOT_CONFIGURED, `${provider} is not configured. Please configure it in Integrations.`, 0);
    this.name = 'ProviderNotConfiguredError';
    this.provider = provider;
  }
}

export class ProviderError extends ApiError {
  provider: string;
  constructor(provider: string, message: string = 'Provider temporarily unavailable.') {
    super(ApiErrorCode.PROVIDER_ERROR, message, 0);
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    perPage?: number;
    requestId?: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/** Shape of the login/signup success payload — the API returns the JWT in the body. */
export interface AuthSession {
  user: { id: string; email: string; name: string; organizationId?: string };
  organization?: unknown;
  token?: string;
}

// ============================================================
// API RESULT TYPE (discriminated union for proper error handling)
// ============================================================

export type ApiResult<T> = 
  | { success: true; data: T }
  | { success: false; error: ApiError };

// ============================================================
// API CLIENT
// ============================================================

const API_BASE_URL = import.meta.env?.VITE_API_URL?.replace(/\/$/, '') || '';
const API_TIMEOUT = 30000;

// ============================================================
// AUTH TOKEN PERSISTENCE
// The API returns the JWT in the login/signup response body and
// accepts it back as an Authorization: Bearer header (or a
// `token` cookie). We persist it in localStorage so sessions
// survive reloads, and attach it to every request.
const TOKEN_STORAGE_KEY = 'rankforge_token';
let memoryToken: string | null = null;
export const AUTH_EXPIRED_EVENT = 'rankforge:session-expired';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setAuthToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // storage unavailable — token lives for this tab only
  }
}

export function clearAuthToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== TOKEN_STORAGE_KEY) return;
    memoryToken = event.newValue;
    if (!event.newValue) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  });
}

export class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string = API_BASE_URL, timeout: number = API_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Check if API backend is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/api/v1/health`, {
        signal: controller.signal,
        credentials: 'include',
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Core request method with proper error classification
   */
  private async request<T>(endpoint: string, options: RequestInit = {}, retry = true): Promise<ApiResult<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const token = getAuthToken();
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
        credentials: 'include',
      });

      clearTimeout(timeoutId);

      // Handle HTTP errors with proper classification
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        let parsedError: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } = {};
        try {
          parsedError = JSON.parse(body);
        } catch {
          // Not JSON
        }

        const errorCode = parsedError.error?.code as ApiErrorCode;
        const errorMessage = parsedError.error?.message || response.statusText || 'Request failed';
        const requestId = response.headers.get('x-request-id') || undefined;

        // Classify error by status code
        switch (response.status) {
          case 401: {
            const isAuthAction = /\/auth\/(login|signup|refresh|forgot-password|reset-password)$/.test(endpoint);
            if (!isAuthAction && retry && await this.refreshSession()) return this.request<T>(endpoint, options, false);
            if (!isAuthAction) {
              clearAuthToken();
              window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
            }
            return { success: false, error: new AuthenticationError(errorMessage) };
          }
          case 403: {
            return { success: false, error: new AuthorizationError(errorMessage) };
          }
          case 404: {
            return { success: false, error: new NotFoundError() };
          }
          case 409: {
            return { success: false, error: new ApiError(ApiErrorCode.CONFLICT, errorMessage, 409, parsedError.error?.details, requestId) };
          }
          case 422: {
            return { success: false, error: new ValidationError(errorMessage, parsedError.error?.details) };
          }
          case 429: {
            const retryAfter = response.headers.get('retry-after');
            return { success: false, error: new RateLimitError(retryAfter ? parseInt(retryAfter) : undefined) };
          }
          case 503: {
            return { success: false, error: new ApiError(ApiErrorCode.SERVICE_UNAVAILABLE, errorMessage, 503, undefined, requestId) };
          }
          default: {
            if (errorCode) {
              return { success: false, error: new ApiError(errorCode, errorMessage, response.status, parsedError.error?.details, requestId) };
            }
            return { success: false, error: new ApiError(ApiErrorCode.INTERNAL_ERROR, errorMessage, response.status, undefined, requestId) };
          }
        }
      }

      // Parse successful response
      const json = await response.json();
      
      // Support both wrapped { success: true, data: ... } and direct data responses
      if (json && typeof json === 'object' && 'success' in json) {
        if (json.success) {
          return { success: true, data: json.data as T };
        } else {
          const err = json as ApiErrorResponse;
          return { 
            success: false, 
            error: new ApiError(err.error.code, err.error.message, 0, err.error.details, err.error.requestId) 
          };
        }
      }

      // Direct data response
      return { success: true, data: json as T };

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, error: new ApiError(ApiErrorCode.TIMEOUT, 'Request timed out.', 0) };
        }
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          return { success: false, error: new NetworkError() };
        }
      }
      
      return { success: false, error: new NetworkError('An unexpected error occurred.') };
    }
  }

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  refreshSession(): Promise<boolean> {
    if (!this.refreshPromise) {
      const previous = getAuthToken();
      const rotate = async () => {
        if (getAuthToken() && getAuthToken() !== previous) return true;
        const result = await this.request<{token:string}>('/api/v1/auth/refresh',{method:'POST'},false);
        if (!result.success) return false;
        setAuthToken(result.data.token);
        return true;
      };
      // Serialize rotation across tabs sharing the same refresh cookie.
      this.refreshPromise = (async () => {
        if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request('rankforge-refresh', rotate);
        return await rotate();
      })()
        .finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise!;
  }

  async getMembers(): Promise<ApiResult<OrganizationMember[]>> {
    const result = await this.request<Array<OrganizationMember & { createdAt: string }>>('/api/v1/organizations/current/members');
    return result.success ? { success: true, data: result.data.map(m => ({...m, role: m.role.toLowerCase() as OrganizationMember['role'], joinedAt: m.createdAt})) } : result;
  }

  async addMember(email: string, role: string): Promise<ApiResult<unknown>> {
    return this.request('/api/v1/organizations/current/members', { method: 'POST', body: JSON.stringify({ email, role }) });
  }

  async requestPasswordReset(email:string):Promise<ApiResult<unknown>> {
    return this.request('/api/v1/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});
  }
  async resetPassword(token:string,password:string):Promise<ApiResult<unknown>> {
    return this.request('/api/v1/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})});
  }
  async login(email: string, password: string): Promise<ApiResult<AuthSession>> {
    const result = await this.request<AuthSession>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (result.success && result.data.token) {
      setAuthToken(result.data.token);
    }
    return result;
  }

  async signup(email: string, password: string, name: string): Promise<ApiResult<AuthSession>> {
    const result = await this.request<AuthSession>('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    if (result.success && result.data.token) {
      setAuthToken(result.data.token);
    }
    return result;
  }

  async logout(): Promise<ApiResult<void>> {
    try {
      return await this.request('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      clearAuthToken();
    }
  }

  async getCurrentUser(): Promise<ApiResult<{ user: { id: string; email: string; name: string; organizationId: string; role: string }; organizations: Organization[] }>> {
    return this.request('/api/v1/auth/me');
  }

  // ============================================================
  // ORGANIZATIONS
  // ============================================================

  async switchOrganization(organizationId: string): Promise<ApiResult<{token:string}>> {
    const result = await this.request<{token:string}>('/api/v1/auth/organization',{method:'POST',body:JSON.stringify({organizationId})});
    if (result.success) setAuthToken(result.data.token);
    return result;
  }

  async getCurrentOrganization(): Promise<ApiResult<Organization>> {
    return this.request('/api/v1/organizations/current');
  }

  // ============================================================
  // PROJECTS
  // ============================================================

  async getProjects(): Promise<ApiResult<Project[]>> {
    return this.request('/api/v1/projects');
  }

  async getProject(id: string): Promise<ApiResult<Project>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(id)}`);
  }

  async createProject(data: { name: string; domain: string; country: string; language: string; timezone?: string }): Promise<ApiResult<Project>> {
    return this.request('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: Partial<Project>): Promise<ApiResult<Project>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string): Promise<ApiResult<void>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ============================================================
  // AUDIT
  // ============================================================

  async getAuditFindings(projectId: string): Promise<ApiResult<AuditFinding[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/audit/findings`);
  }

  async runAudit(projectId: string): Promise<ApiResult<Job>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/audit`, {
      method: 'POST',
    });
  }

  async startCrawl(projectId: string, options: { maxPages?: number; maxDepth?: number; concurrency?: number } = {}): Promise<ApiResult<{ job: Job; crawlRun: any }>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/crawl`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async getCrawls(projectId: string): Promise<ApiResult<any[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/crawls`);
  }

  async checkRankings(projectId: string): Promise<ApiResult<{ job: Job }>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/rankings/check`, {
      method: 'POST',
    });
  }

  async syncBacklinks(projectId: string): Promise<ApiResult<{ job: Job }>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/backlinks/sync`, {
      method: 'POST',
    });
  }

  async checkPageSpeed(projectId: string, url: string): Promise<ApiResult<{ job: Job }>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/pagespeed/check`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  // ============================================================
  // KEYWORDS
  // ============================================================

  async getKeywords(projectId: string): Promise<ApiResult<Keyword[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/keywords`);
  }

  async addKeywords(
    projectId: string,
    keywords: string[],
    options: { country?: string; language?: string } = {}
  ): Promise<ApiResult<Keyword[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/keywords`, {
      method: 'POST',
      body: JSON.stringify({
        keywords,
        ...(options.country ? { country: options.country } : {}),
        ...(options.language ? { language: options.language } : {}),
      }),
    });
  }

  // ============================================================
  // RANKINGS
  // ============================================================

  async getRankings(projectId: string): Promise<ApiResult<RankingEntry[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/rankings`);
  }

  // ============================================================
  // JOBS
  // ============================================================

  async getJobs(projectId: string): Promise<ApiResult<Job[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/jobs`);
  }

  // ============================================================
  // REPORTS
  // ============================================================

  async getReports(projectId: string): Promise<ApiResult<Report[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/reports`);
  }

  async generateReport(projectId: string, type: string, format: string): Promise<ApiResult<Report>> {
    const result=await this.request<{report:Report;job:Job}>(`/api/v1/projects/${encodeURIComponent(projectId)}/reports`, {
      method:'POST',body:JSON.stringify({type,format}),
    });
    return result.success ? {success:true,data:result.data.report} : result;
  }

  // ============================================================
  // ALERTS
  // ============================================================

  async getAlerts(projectId: string): Promise<ApiResult<Alert[]>> {
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/alerts`);
  }

  // ============================================================
  // PROVIDER STATUS
  // ============================================================

  async getProviderStatus(): Promise<ApiResult<Record<string, ProviderStatus>>> {
    return this.request('/api/v1/integrations/status');
  }

  // ===========================================================
  // GOOGLE OAUTH (Search Console + GA4)
  // ===========================================================

  /** Returns the Google consent URL — navigate the browser to it to connect. */
  async getGoogleConnectUrl(): Promise<ApiResult<{ url: string; scopes: string[] }>> {
    return this.request('/api/v1/integrations/google/connect');
  }

  async getGoogleConnectionStatus(): Promise<ApiResult<{ configured: boolean; connected: boolean; email?: string; connectedAt?: string }>> {
    return this.request('/api/v1/integrations/google/status');
  }

  async disconnectGoogle(): Promise<ApiResult<{ disconnected: boolean }>> {
    return this.request('/api/v1/integrations/google', { method: 'DELETE' });
  }
}

// Export singleton instance
export const api = new ApiClient();

// Helper to check if an error is a specific type
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isAuthError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isProviderError(error: unknown): error is ProviderNotConfiguredError | ProviderError {
  return error instanceof ProviderNotConfiguredError || error instanceof ProviderError;
}

/** Authenticated transport for pages that consume raw Response objects. */
export async function authenticatedFetch(input: string, options: RequestInit = {}): Promise<Response> {
  const url = new URL(input, window.location.origin);
  const apiOrigin = new URL(API_BASE_URL || window.location.origin, window.location.origin).origin;
  if (url.origin !== apiOrigin || !url.pathname.startsWith('/api/v1/')) throw new Error('Untrusted API URL');
  async function send() {
    const headers = new Headers(options.headers);
    const token = getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...options, headers, credentials: 'include' });
  }
  let response = await send();
  if (response.status === 401) {
    if (await api.refreshSession()) response = await send();
    if (response.status === 401) { clearAuthToken(); window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)); }
  }
  return response;
}

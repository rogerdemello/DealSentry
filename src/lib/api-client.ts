const API_BASE_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

// Type definitions
export interface Proposal {
  id: string;
  title: string;
  content: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
  metadata: {
    clientName?: string;
    dealSize?: number;
    discount?: number;
    region?: string;
    currency?: string;
    industry?: string;
  };
  userId: string;
  readinessScore: number;
  riskReport?: {
    readinessScore?: number;
    legalRisk: number;
    pricingRisk: number;
    structuralRisk: number;
    findings: Array<{
      type: string;
      level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      message: string;
      location?: string;
    }>;
    recommendations: Array<{
      paragraphId: string;
      suggestion: string;
      reason: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Rule {
  id: string;
  name: string;
  type: string;
  description: string;
  logic: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  type: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  timestamp: string;
  actorId: string;
  actor: {
    name: string | null;
    email: string;
    role: string;
  };
  proposalId: string | null;
  proposal: { title: string } | null;
}

/** Message shown when the server cannot be reached (e.g. backend not running). */
export const NETWORK_ERROR_MESSAGE =
  'Cannot reach the server. Make sure the API is running (e.g. run "npm run server" or use start.bat).';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

// Helper function to wait/delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Health check function to verify API server is reachable
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Helper for API calls with retry logic
async function apiCall<T>(
  endpoint: string,
  options?: RequestInit,
  retryCount = 0
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Get auth token from localStorage
  const token = localStorage.getItem('auth_token');

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options?.headers,
      },
      ...options,
    });
  } catch (err) {
    const msg = (err as Error).message || '';
    const isNetworkError =
      err instanceof TypeError ||
      msg === 'Failed to fetch' ||
      msg === 'Load failed' ||
      /network|fetch|connection|refused/i.test(msg);
    
    // Retry network errors
    if (isNetworkError && retryCount < RETRY_CONFIG.maxRetries) {
      console.log(`Network error, retrying... (${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);
      await delay(RETRY_CONFIG.retryDelay * (retryCount + 1)); // Exponential backoff
      return apiCall<T>(endpoint, options, retryCount + 1);
    }
    
    throw new Error(isNetworkError ? NETWORK_ERROR_MESSAGE : msg);
  }

  // Retry on specific HTTP status codes
  if (!response.ok && RETRY_CONFIG.retryableStatuses.includes(response.status) && retryCount < RETRY_CONFIG.maxRetries) {
    console.log(`HTTP ${response.status} error, retrying... (${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);
    await delay(RETRY_CONFIG.retryDelay * (retryCount + 1));
    return apiCall<T>(endpoint, options, retryCount + 1);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Proposals API
export const proposalsApi = {
  getAll: () => apiCall<Proposal[]>('/api/proposals'),
  
  getById: (id: string) => apiCall<Proposal>(`/api/proposals/${id}`),
  
  create: (data: { title: string; content: string; metadata?: Record<string, unknown> }) =>
    apiCall<Proposal>('/api/proposals', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  generateFromNaturalLanguage: (naturalLanguageQuery: string) =>
    apiCall<Proposal>('/api/proposals/generate', {
      method: 'POST',
      body: JSON.stringify({ naturalLanguageQuery }),
    }),
  
  updateStatus: (id: string, status: Proposal['status']) =>
    apiCall<{ id: string; status: string }>(`/api/proposals/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
  
  delete: (id: string) =>
    apiCall<{ success: boolean }>(`/api/proposals/${id}`, {
      method: 'DELETE',
    }),
  
  analyze: (id: string) =>
    apiCall<{ proposalId: string; riskReport: Proposal['riskReport'] }>(`/api/analyze/${id}`, {
      method: 'POST',
    }),
};

// Rules API
export const rulesApi = {
  getAll: () => apiCall<Rule[]>('/api/rules'),
  
  create: (data: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>) =>
    apiCall<Rule>('/api/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: Partial<Rule>) =>
    apiCall<Rule>(`/api/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    apiCall<{ success: boolean }>(`/api/rules/${id}`, {
      method: 'DELETE',
    }),
};

// Templates API
export const templatesApi = {
  getAll: () => apiCall<Template[]>('/api/templates'),
  
  create: (data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) =>
    apiCall<Template>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Audit API
export const auditApi = {
  getAll: () => apiCall<AuditLog[]>('/api/audit'),
};

// Users API
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'SALES_REP' | 'SALES_MANAGER' | 'LEGAL' | 'REVOPS' | 'ADMIN' | 'AUDITOR';
  companyId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const usersApi = {
  getAll: () => apiCall<User[]>('/api/users'),
  getById: (id: string) => apiCall<User>(`/api/users/${id}`),
  create: (data: { email: string; name?: string; role?: User['role'] }) =>
    apiCall<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<User>) =>
    apiCall<User>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiCall<void>(`/api/users/${id}`, {
      method: 'DELETE',
    }),
};

// Auth API
export interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiCall<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, name?: string) =>
    apiCall<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  verify: () => apiCall<{ user: User }>('/api/auth/verify'),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiCall<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// Integrations API
export interface Integration {
  id: string;
  type: 'SALESFORCE' | 'HUBSPOT' | 'GMAIL' | 'GOOGLE_DRIVE' | 'DOCUSIGN' | 'SHAREPOINT';
  name: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncLog {
  id: string;
  integrationId: string;
  action: 'IMPORT' | 'EXPORT' | 'SYNC';
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  recordsAffected: number;
  details: Record<string, unknown>;
  createdAt: string;
}

export const integrationsApi = {
  getAll: () => apiCall<Integration[]>('/api/integrations'),
  getById: (id: string) => apiCall<Integration>(`/api/integrations/${id}`),
  create: (data: { type: Integration['type']; name: string; credentials?: Record<string, unknown>; config?: Record<string, unknown> }) =>
    apiCall<Integration>('/api/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Integration>) =>
    apiCall<Integration>(`/api/integrations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiCall<void>(`/api/integrations/${id}`, {
      method: 'DELETE',
    }),
  sync: (id: string) =>
    apiCall<{ success: boolean; message: string; syncLog: SyncLog }>(`/api/integrations/${id}/sync`, {
      method: 'POST',
    }),
  getLogs: (id: string, limit?: number) =>
    apiCall<SyncLog[]>(`/api/integrations/${id}/logs${limit ? `?limit=${limit}` : ''}`),
};

// Files API
export const filesApi = {
  upload: (file: string, fileName: string, proposalId?: string) =>
    apiCall<{ success: boolean; fileUrl: string; filePath: string; extractedText: string | null }>('/api/files/upload', {
      method: 'POST',
      body: JSON.stringify({ file, fileName, proposalId }),
    }),
  extractText: (file: string, fileName: string) =>
    apiCall<{ success: boolean; extractedText: string; wordCount: number; charCount: number }>('/api/files/extract-text', {
      method: 'POST',
      body: JSON.stringify({ file, fileName }),
    }),
  download: (path: string) =>
    fetch(`${API_BASE_URL}/api/files/download/${path}`).then(res => res.blob()),
  delete: (path: string) =>
    apiCall<{ success: boolean; message: string }>(`/api/files/${path}`, {
      method: 'DELETE',
    }),
};

// Health check
export const healthCheck = () => 
  apiCall<{ status: string; timestamp: string }>('/api/health');

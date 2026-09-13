// src/lib/api/client.ts
// Base HTTP client for Crestline Capital API

// Backend response format
interface BackendSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    hasNextPage?: boolean;
    hasPrevPage?: boolean;
  };
  message?: string;
}

interface BackendErrorResponse {
  success: false;
  error: string;
  message?: string;
  details?: Record<string, any>;
  statusCode?: number;
}

type BackendResponse<T> = BackendSuccessResponse<T> | BackendErrorResponse;

interface ApiError {
  error: string;
  message?: string;
  details?: Record<string, any>;
  statusCode: number;
}

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || '';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    data?: any,
    headers?: Record<string, string>,
    token?: string
  ): Promise<BackendResponse<T>> {
    const url = this.baseUrl + endpoint;
    
    const config: RequestInit = {
      method,
      headers: {
        ...this.defaultHeaders,
        ...headers,
      },
    };

    if (token) {
      config.headers = { ...config.headers, Authorization: 'Bearer ' + token };
    }

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'Network error',
        message: response.statusText,
        statusCode: response.status,
      }));
      throw error;
    }

    const backendResponse: BackendResponse<T> = await response.json();
    
    if (!backendResponse.success) {
      // Handle backend error response
      const error: ApiError = {
        error: (backendResponse as BackendErrorResponse).error,
        message: (backendResponse as BackendErrorResponse).message,
        details: (backendResponse as BackendErrorResponse).details,
        statusCode: (backendResponse as BackendErrorResponse).statusCode || 400,
      };
      throw error;
    }
    
    // Return the full backend response for the caller to handle
    return backendResponse;
  }

  async get<T>(endpoint: string, token?: string, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, headers, token);
  }

  async post<T>(endpoint: string, data?: any, token?: string, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>('POST', endpoint, data, headers, token);
  }

  async put<T>(endpoint: string, data?: any, token?: string, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>('PUT', endpoint, data, headers, token);
  }

  async patch<T>(endpoint: string, data?: any, token?: string, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>('PATCH', endpoint, data, headers, token);
  }

  async delete<T>(endpoint: string, token?: string, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, headers, token);
  }
}

const apiClient = new ApiClient();

export { apiClient, ApiClient, ApiError, BackendResponse, BackendSuccessResponse, BackendErrorResponse };
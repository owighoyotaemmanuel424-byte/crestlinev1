// src/lib/api/client.ts
// Base HTTP client for Crestline Capital API

interface ApiResponse<T> {
  data: T;
  message?: string;
}

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
  ): Promise<T> {
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

    const responseData: ApiResponse<T> = await response.json();
    return responseData.data;
  }

  async get<T>(endpoint: string, token?: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', endpoint, undefined, headers, token);
  }

  async post<T>(endpoint: string, data?: any, token?: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', endpoint, data, headers, token);
  }

  async put<T>(endpoint: string, data?: any, token?: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PUT', endpoint, data, headers, token);
  }

  async patch<T>(endpoint: string, data?: any, token?: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PATCH', endpoint, data, headers, token);
  }

  async delete<T>(endpoint: string, token?: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', endpoint, undefined, headers, token);
  }
}

const apiClient = new ApiClient();

export { apiClient, ApiClient, ApiResponse, ApiError };
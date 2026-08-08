/**
 * AutoWashPro API Client
 * Axios instance with interceptors
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// Configuration
//
// H-6 SAFETY: cảnh báo rõ ràng khi production build thiếu env. Trước đây fallback
// silent về localhost, production request đi vào localhost → fail. Giờ:
//   - Dev (__DEV__ = true): fallback localhost OK cho dev experience.
//   - Prod (__DEV__ = false): nếu thiếu env → throw error ngay khi load module,
//     tránh runtime fail mà không ai biết.
if (!process.env.EXPO_PUBLIC_API_URL) {
  if (__DEV__) {
    console.warn(
      '[AutoWashPro] EXPO_PUBLIC_API_URL missing in dev → using http://localhost:5000/api. OK for dev only.',
    );
  } else {
    throw new Error(
      '[AutoWashPro] EXPO_PUBLIC_API_URL is required in production. ' +
        'Set it in your build environment (EAS Build, app.json, or runtime config).',
    );
  }
}
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

// Storage keys
const ACCESS_TOKEN_KEY = 'aw_accessToken';
const REFRESH_TOKEN_KEY = 'aw_refreshToken';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor - unwrap data from { success, data } and normalize _id → id
apiClient.interceptors.response.use(
  (response) => {
    // If response has { success, data }, unwrap it
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      response.data = response.data.data;
    }
    // Normalize _id → id for all response objects (arrays or single objects)
    if (response.data && typeof response.data === 'object') {
      response.data = normalizeId(response.data);
    }
    return response;
  },
  (error) => Promise.reject(error)
);

function normalizeId(data: any): any {
  if (Array.isArray(data)) {
    return data.map(normalizeId);
  }
  if (data && typeof data === 'object' && data._id && !data.id) {
    return { ...data, id: data._id };
  }
  return data;
}

// Token refresh state
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

// Subscribe to token refresh
const subscribeTokenRefresh = (callback: (token: string | null) => void) => {
  refreshSubscribers.push(callback);
};

// Notify all subscribers with new token
const onRefreshComplete = (token: string | null) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

// Token cache to prevent disk I/O bottlenecks
let _cachedAccessToken: string | null = null;
let _isTokenLoaded = false;

export const setAccessTokenCache = (token: string | null) => {
  _cachedAccessToken = token;
  _isTokenLoaded = true;
};

export const clearAccessTokenCache = () => {
  _cachedAccessToken = null;
  _isTokenLoaded = false;
};

// Get tokens from storage
const getAccessToken = async (): Promise<string | null> => {
  if (_isTokenLoaded) {
    return _cachedAccessToken;
  }
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  _cachedAccessToken = token;
  _isTokenLoaded = true;
  return token;
};

const getRefreshToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
};

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized
    // List of auth endpoints that are public and should NOT trigger token refresh on 401
    const publicAuthRoutes = ['/auth/login', '/auth/register', '/auth/google', '/auth/forgot-password', '/auth/reset-password', '/auth/verify-otp'];
    const isAuthRequest = publicAuthRoutes.some(route => originalRequest.url?.includes(route));

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      if (isRefreshing) {
        // Wait for token refresh to complete
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token: string | null) => {
            if (!token) {
              reject(error);
              return;
            }
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          // If there's no refresh token, we can't refresh.
          // Reject with the original 401 error so the caller can read its payload.
          isRefreshing = false;
          return Promise.reject(error);
        }

// Call refresh token endpoint
      const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
        refreshToken,
      });

      // Refresh endpoint returns { success, data: { accessToken, refreshToken } }
      const payload = response.data?.data ?? response.data;
      const { accessToken, refreshToken: newRefreshToken } = payload ?? {};

      if (!accessToken || !newRefreshToken) {
        throw new Error('Invalid refresh response');
      }

      // Store new tokens
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);
      setAccessTokenCache(accessToken);

        // Retry original request
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        onRefreshComplete(accessToken);
        isRefreshing = false;

        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];

        // Clear tokens on refresh failure
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        clearAccessTokenCache();

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Export api client
export { apiClient };
export default apiClient;

// Helper function to get full image URL
export const getImageUrl = (path?: string): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL.replace('/api', '')}${path}`;
};

// Export API base URL for use in components
export { API_BASE_URL };


import { api } from './client';
import type { User, ApiResponse } from '../types';

export const authApi = {
  login: (email: string, password: string, tenant: string) =>
    api.post<ApiResponse<{ accessToken: string; expiresIn: string }>>('/auth/login', { email, password, tenant }),

  me: () => api.get<ApiResponse<User>>('/auth/me'),

  logout: () => api.post('/auth/logout'),
};

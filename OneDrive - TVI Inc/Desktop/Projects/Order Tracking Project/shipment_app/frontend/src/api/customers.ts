import { api } from './client';
import type { Customer, PaginatedResponse, ApiResponse } from '../types';

export const customersApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<Customer>>('/customers', { params }),
  get:    (id: string)                       => api.get<ApiResponse<Customer>>(`/customers/${id}`),
  create: (data: Partial<Customer>)          => api.post<ApiResponse<Customer>>('/customers', data),
  update: (id: string, data: Partial<Customer>) => api.put<ApiResponse<Customer>>(`/customers/${id}`, data),
  delete: (id: string)                       => api.delete(`/customers/${id}`),
};

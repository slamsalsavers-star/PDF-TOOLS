import { api } from './client';
import type { Shipment, PaginatedResponse, ApiResponse } from '../types';

export const shipmentsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Shipment>>('/shipments', { params }),

  get: (id: string) =>
    api.get<ApiResponse<Shipment>>(`/shipments/${id}`),

  create: (data: Partial<Shipment>) =>
    api.post<ApiResponse<Shipment>>('/shipments', data),

  update: (id: string, data: Partial<Shipment>) =>
    api.put<ApiResponse<Shipment>>(`/shipments/${id}`, data),

  delete: (id: string) =>
    api.delete(`/shipments/${id}`),

  addStatus: (id: string, data: { status_id: string; notes?: string }) =>
    api.post(`/shipments/${id}/statuses`, data),

  addComment: (id: string, comment: string) =>
    api.post(`/shipments/${id}/comments`, { comment }),
};

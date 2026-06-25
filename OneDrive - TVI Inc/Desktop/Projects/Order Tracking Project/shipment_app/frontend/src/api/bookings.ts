import { api } from './client';
import type { Booking, PaginatedResponse, ApiResponse } from '../types';

export const bookingsApi = {
  list:   (params?: Record<string, unknown>) => api.get<PaginatedResponse<Booking>>('/bookings', { params }),
  get:    (id: string)                       => api.get<ApiResponse<Booking>>(`/bookings/${id}`),
  create: (data: Partial<Booking>)           => api.post<ApiResponse<Booking>>('/bookings', data),
  update: (id: string, data: Partial<Booking>) => api.put<ApiResponse<Booking>>(`/bookings/${id}`, data),
  delete: (id: string)                       => api.delete(`/bookings/${id}`),
  lookup: (booking_number: string, shipping_line_id: string) =>
    api.post<ApiResponse<Record<string, unknown>>>('/bookings/lookup', { booking_number, shipping_line_id }),
};

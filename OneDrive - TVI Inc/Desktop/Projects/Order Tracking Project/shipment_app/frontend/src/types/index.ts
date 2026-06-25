export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  last_login_at: string | null;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  role_id: string | null;
  role_name: string | null;
}

export interface Shipment {
  id: string;
  tenant_id: string;
  order_number: string;
  reference: string | null;
  facility_id: string | null;
  facility_name: string | null;
  forwarder_id: string | null;
  forwarder_name: string | null;
  booking_id: string | null;
  booking_number: string | null;
  carrier: string | null;
  despatch_date: string | null;
  place_of_destination: string | null;
  country: string | null;
  customer: string | null;
  consignee: string | null;
  transport_mode: string | null;
  field: string | null;
  folder_link: string | null;
  description: string | null;
  current_status: string | null;
  status_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  reference: string | null;
  booking_number: string;
  booking_type: string | null;
  booking_received_date: string | null;
  cut_off: string | null;
  vessel: string | null;
  voyage: string | null;
  eta: string | null;
  rail: string | null;
  shipping_line_id: string | null;
  shipping_line_name: string | null;
  description: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  alias: string;
  description: string;
  customer_type: string | null;
  address: string | null;
  primary_forwarder_id: string | null;
  primary_forwarder_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Forwarder {
  id: string;
  name: string;
  code: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface ShippingLine {
  id: string;
  name: string;
  code: string;
  api_base_url: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface Period {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface Facility {
  id: string;
  description: string;
  city_id: string | null;
  city_name: string | null;
  address: string | null;
  is_active: boolean;
}

export interface Role {
  id: string;
  name: string;
  is_system: boolean;
  permission_count: number;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
}

export interface Status {
  id: string;
  description: string;
  color: string;
  sort_order: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

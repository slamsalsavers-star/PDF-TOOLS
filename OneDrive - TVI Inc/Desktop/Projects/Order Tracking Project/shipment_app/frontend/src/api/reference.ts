import { api } from './client';

export const referenceApi = {
  statuses:      () => api.get('/reference/statuses'),
  shipmentTypes: () => api.get('/reference/shipment-types'),
  creationTypes: () => api.get('/reference/creation-types'),
  countries:     () => api.get('/reference/countries'),
  dashboard:     () => api.get('/reference/dashboard'),
  forwarders:    () => api.get('/forwarders'),
  facilities:    () => api.get('/facilities'),
  shippingLines: () => api.get('/shipping-lines'),
};

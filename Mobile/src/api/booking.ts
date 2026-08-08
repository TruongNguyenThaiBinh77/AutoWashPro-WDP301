/**
 * AutoWashPro Booking API Service
 * Booking management endpoints
 */

import { apiClient } from './client';
import type {
  Booking,
  CreateBookingRequest,
  CreateRecurringBookingRequest,
  RecurringBookingResult,
  AvailableSlot,
} from '../types';

// Create new booking
export const createBooking = async (data: CreateBookingRequest): Promise<Booking> => {
  const response = await apiClient.post('/bookings', data);
  return response.data;
};

// Create recurring booking
export const createRecurringBooking = async (
  data: CreateRecurringBookingRequest,
): Promise<RecurringBookingResult> => {
  const response = await apiClient.post('/bookings/recurring', data);
  return response.data as RecurringBookingResult;
};

// Check recurring booking conflicts
export const checkRecurringConflicts = async (
  data: {
    branchId: string;
    packageId: string;
    vehicleId: string;
    weekdays: number[];
    startTime: string;
    weeks: number;
  }
): Promise<any> => {
  const response = await apiClient.post('/bookings/recurring/check-conflicts', data);
  return response.data;
};

export const getRecurringCancelPreview = async (groupId: string): Promise<any> => {
  const response = await apiClient.get(`/bookings/recurring/${groupId}/cancel-preview`);
  return response.data;
};

export const requestRecurringCancelOtp = async (groupId: string): Promise<any> => {
  const response = await apiClient.post(`/bookings/recurring/${groupId}/cancel-otp`);
  return response.data;
};

// Cancel recurring booking group
export const cancelRecurringGroup = async (groupId: string, otp?: string): Promise<{ message: string }> => {
  const response = await apiClient.post(`/bookings/recurring/${groupId}/cancel`, { otp });
  return response.data;
};

// Get my bookings
export const getMyBookings = async (params?: {
  status?: string;
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
  recurringGroupId?: string;
}): Promise<{ data: Booking[]; pagination?: any }> => {
  const response = await apiClient.get('/bookings/my', { params });
  // Backend wraps list endpoints as { bookings: [...], pagination: {...} }
  // Mobile interceptor unwraps { success, data } → { bookings: [...], pagination: {...} }
  // So response.data is { bookings, pagination } — extract bookings array
  const payload = response.data as { bookings?: Booking[]; pagination?: any };
  return { data: payload.bookings || [], pagination: payload.pagination };
};

// Get available time slots
export const getAvailableSlots = async (params: {
  branchId: string;
  date: string;
  packageId: string;
}): Promise<AvailableSlot[]> => {
  const response = await apiClient.get('/bookings/slots', { params });
  return response.data;
};

// Get booking by ID
export const getBooking = async (id: string): Promise<Booking> => {
  const response = await apiClient.get(`/bookings/${id}`);
  return response.data;
};

// Get cancel preview
export const getCancelPreview = async (id: string): Promise<any> => {
  const response = await apiClient.get(`/bookings/${id}/cancel-preview`);
  return response.data;
};

// Request OTP for cancellation
export const requestCancelOtp = async (id: string): Promise<any> => {
  const response = await apiClient.post(`/bookings/${id}/cancel-otp`);
  return response.data;
};

// Cancel booking
export const cancelBooking = async (id: string, cancellationReason?: string, otp?: string): Promise<Booking> => {
  const response = await apiClient.post(`/bookings/${id}/cancel`, { cancellationReason, otp });
  return response.data;
};

// Submit feedback/rating
export const submitFeedback = async (
  id: string,
  data: { rating?: number; feedback?: string }
): Promise<Booking> => {
  const response = await apiClient.patch(`/bookings/${id}/feedback`, data);
  return response.data;
};

// Rebook from existing booking
export const rebookBooking = async (
  id: string,
  data: { bookingDate: string; startTime: string }
): Promise<Booking> => {
  const response = await apiClient.post(`/bookings/${id}/rebook`, data);
  return response.data;
};

// Update booking (e.g. quick reschedule)
export const updateBooking = async (id: string, data: { startTime?: string; bookingDate?: string }) => {
  const response = await apiClient.put(`/bookings/${id}`, data);
  return response.data;
};

// Update sub-services for an existing booking
export const updateSubServices = async (id: string, subServices: string[]) => {
  const response = await apiClient.patch(`/bookings/${id}/sub-services`, { subServices });
  return response.data;
};

// Get booking QR code
// BE returns { qrDataUrl, bookingId } — base64 PNG of the QR.
// (Previously typed as `qrCode` which is undefined → QR rendering broken.)
export const getBookingQR = async (id: string): Promise<{ qrDataUrl: string; bookingId: string }> => {
  const response = await apiClient.get(`/bookings/${id}/qr`);
  return response.data;
};

// Export all booking API functions
export const bookingApi = {
  createBooking,
  createRecurringBooking,
  checkRecurringConflicts,
  cancelRecurringGroup,
  getRecurringCancelPreview,
  requestRecurringCancelOtp,
  getMyBookings,
  getAvailableSlots,
  getBooking,
  getCancelPreview,
  requestCancelOtp,
  cancelBooking,
  submitFeedback,
  rebookBooking,
  updateBooking,
  updateSubServices,
  getBookingQR,
};

export default bookingApi;

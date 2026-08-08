/**
 * AutoWashPro API Services
 * Export all API service modules
 */

export { apiClient, getImageUrl, API_BASE_URL, default as axiosClient } from './client';
export { authApi } from './auth';
export { vehicleApi } from './vehicle';
export { branchApi } from './branch';
export { packageApi } from './package';
export { bookingApi } from './booking';
export { paymentApi } from './payment';
export { voucherApi } from './voucher';
export { slotPackApi } from './slotPack';
export { notificationApi } from './notification';
export { publicApi } from './public';
export { chatbotApi } from './chatbot';
export { feedbackApi } from './feedback';
export type { FeedbackType, FeedbackPayload, FeedbackResponse } from './feedback';
export { giftApi } from './gift';
export { rewardApi } from './reward';
export { loyaltyApi } from './loyalty';
export { refundApi } from './refund';
export { walletApi } from './wallet';

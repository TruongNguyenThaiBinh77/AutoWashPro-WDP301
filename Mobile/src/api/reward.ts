/**
 * AutoWashPro Physical Rewards API Service
 */

import { apiClient } from './client';
import type { PhysicalReward, Redemption } from '../types';

export const getPublicRewards = async (): Promise<PhysicalReward[]> => {
  const response = await apiClient.get('/rewards/public');
  const payload = response.data as PhysicalReward[] | { data?: PhysicalReward[] };
  return Array.isArray(payload) ? payload : payload.data || [];
};

export const getMyRewards = async (): Promise<Redemption[]> => {
  const response = await apiClient.get('/rewards/me');
  const payload = response.data as Redemption[] | { data?: Redemption[] };
  return Array.isArray(payload) ? payload : payload.data || [];
};

export const redeemReward = async (rewardId: string): Promise<{ code: string }> => {
  const response = await apiClient.post('/rewards/redeem', { rewardId });
  return response.data?.data?.redemption || response.data?.redemption;
};

export const rewardApi = {
  getPublicRewards,
  getMyRewards,
  redeemReward,
};

export default rewardApi;

import { getApiBaseUrl, getStoredToken } from './authStorage.js';
import i18n from '../i18n/index';

const SESSION_KEY = 'aw_chat_session';

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export async function sendChatMessage(message) {
  const apiBase = getApiBaseUrl();
  const token = getStoredToken();
  const sessionId = getSessionId();

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiBase}/chat/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, sessionId }),
  });

  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || i18n.t('shared.chatbot.error'));
  return payload.data?.reply || i18n.t('shared.chatbot.fallback');
}

export function clearChatSession() {
  const sessionId = localStorage.getItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (!sessionId) return;

  const apiBase = getApiBaseUrl();
  const token = getStoredToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  fetch(`${apiBase}/chat/clear`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
}

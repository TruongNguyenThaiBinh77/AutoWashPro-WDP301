const EventEmitter = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(200);

// Map userId (string) → Set of res objects
const clients = new Map();

function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

function removeClient(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

function sendToUser(userId, event, data) {
  // 1. Send via SSE (for Web)
  const set = clients.get(String(userId));
  if (set && set.size > 0) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try { res.write(payload); } catch { /* client disconnected */ }
    }
  }
  // 2. Send via Socket.io (for Mobile)
  try {
    const socket = require('./../socket');
    socket.getIO().to(`user_${userId}`).emit(event, data);
  } catch (err) {
    // ignore if socket is not initialized
  }
}

function broadcastToManagers(branchId, event, data) {
  // SSE
  emitter.emit('manager-event', { branchId: String(branchId), event, data });
  // Socket.io
  try {
    const socket = require('./../socket');
    if (branchId) socket.getIO().to(`branch_${branchId}`).emit(event, data);
    socket.getIO().to('admin').emit(event, data);
  } catch (err) {
    // ignore
  }
}

function broadcastToAll(event, data) {
  // SSE
  const payload = `event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`;
  for (const set of clients.values()) {
    for (const res of set) {
      try { res.write(payload); } catch { /* client disconnected */ }
    }
  }
  // Socket.io
  try {
    const socket = require('./../socket');
    socket.getIO().emit(event, data || {});
  } catch (err) {
    // ignore
  }
}

module.exports = { addClient, removeClient, sendToUser, broadcastToManagers, broadcastToAll, emitter };

import { io } from 'socket.io-client';

let socket;

export function getSocket() {
  if (!socket) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000';
    socket = io(origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
  }
  return socket;
}

export function useSocketEvents(events, enabled = true) {
  const socketInstance = enabled ? getSocket() : null;
  return socketInstance;
}
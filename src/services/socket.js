import { io } from 'socket.io-client';

let socket;

export function getSocket() {
  if (!socket) socket = io({ autoConnect: true });
  return socket;
}

export function useSocketEvents(events, enabled = true) {
  const socketInstance = enabled ? getSocket() : null;
  return socketInstance;
}
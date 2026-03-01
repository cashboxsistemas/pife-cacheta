import { io, Socket } from 'socket.io-client';

// Initialize socket connection
// In development, this connects to the same host/port as the dev server
// In production, it connects to the deployed URL
export const socket: Socket = io({
  autoConnect: false,
});

export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};

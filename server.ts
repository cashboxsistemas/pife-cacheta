import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Deck } from './server/Deck';
import { GameState, Player, Card } from './src/types/game';
import { Rules } from './server/game/Rules';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;

  // Enhanced Room Interface
  interface Room {
    id: string;
    players: string[]; // Socket IDs
    playerData: Record<string, Player>; // Map Socket ID to Player Data
    gameType: 'pife' | 'cacheta';
    status: 'waiting' | 'playing' | 'finished';
    deck: Deck;
    discardPile: Card[];
    currentPlayerIndex: number;
    turnPhase: 'draw' | 'discard';
    vira?: Card;
  }

  const rooms: Record<string, Room> = {};

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', ({ type, playerName }: { type: 'pife' | 'cacheta', playerName: string }) => {
      const roomId = uuidv4().slice(0, 6).toUpperCase();
      const name = playerName || `Player ${roomId.slice(0,2)}`;
      
      // Initialize Room
      rooms[roomId] = {
        id: roomId,
        players: [socket.id],
        playerData: {
          [socket.id]: {
            id: socket.id,
            name: name,
            hand: [],
            isTurn: false,
            score: 0
          }
        },
        gameType: type,
        status: 'waiting',
        deck: new Deck(2), // 2 decks for Pife/Cacheta usually
        discardPile: [],
        currentPlayerIndex: 0,
        turnPhase: 'draw'
      };

      socket.join(roomId);
      socket.emit('room_created', roomId);
      // Send initial state update
      emitGameState(io, roomId);
      
      console.log(`Room ${roomId} created for ${type} by ${name}`);
    });

    socket.on('join_room', ({ roomId, playerName }: { roomId: string, playerName: string }) => {
      const room = rooms[roomId];
      if (room && room.players.length < 4 && room.status === 'waiting') {
        const name = playerName || `Player ${socket.id.slice(0,4)}`;
        
        room.players.push(socket.id);
        room.playerData[socket.id] = {
          id: socket.id,
          name: name,
          hand: [],
          isTurn: false,
          score: 0
        };
        
        socket.join(roomId);
        io.to(roomId).emit('player_joined', room.players.length);
        emitGameState(io, roomId);
        console.log(`User ${name} joined room ${roomId}`);
      } else {
        socket.emit('error', 'Room not found, full, or game already started');
      }
    });

    socket.on('start_game', (roomId: string) => {
      const room = rooms[roomId];
      if (room && room.players.length >= 2 && room.status === 'waiting') { // Min 2 players
        startGame(room);
        emitGameState(io, roomId);
      }
    });

    socket.on('draw_card', (roomId: string) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;
      
      const currentPlayerId = room.players[room.currentPlayerIndex];
      if (socket.id !== currentPlayerId) return; // Not your turn
      if (room.turnPhase !== 'draw') return; // Wrong phase

      const card = room.deck.draw();
      if (card) {
        card.isHidden = false;
        room.playerData[currentPlayerId].hand.push(card);
        room.turnPhase = 'discard';
        emitGameState(io, roomId);
      } else {
        // Handle empty deck (reshuffle discard pile logic would go here)
        socket.emit('error', 'Deck is empty!');
      }
    });

    socket.on('draw_from_discard', (roomId: string) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;

      const currentPlayerId = room.players[room.currentPlayerIndex];
      if (socket.id !== currentPlayerId) return; // Not your turn
      if (room.turnPhase !== 'draw') return; // Wrong phase

      if (room.discardPile.length === 0) {
        socket.emit('error', 'Discard pile is empty!');
        return;
      }

      const card = room.discardPile.pop();
      if (card) {
        card.isHidden = false; // Should already be visible, but ensure it
        room.playerData[currentPlayerId].hand.push(card);
        room.turnPhase = 'discard';
        emitGameState(io, roomId);
      }
    });

    socket.on('discard_card', ({ roomId, cardId }: { roomId: string, cardId: string }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;

      const currentPlayerId = room.players[room.currentPlayerIndex];
      if (socket.id !== currentPlayerId) return; // Not your turn
      if (room.turnPhase !== 'discard') return; // Wrong phase

      const player = room.playerData[currentPlayerId];
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      
      if (cardIndex !== -1) {
        const [card] = player.hand.splice(cardIndex, 1);
        room.discardPile.push(card);
        
        // Advance turn
        room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
        room.turnPhase = 'draw';
        
        // Update isTurn flags
        room.players.forEach((pid, idx) => {
          room.playerData[pid].isTurn = idx === room.currentPlayerIndex;
        });

        emitGameState(io, roomId);
      }
    });

    socket.on('declare_victory', (roomId: string) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;

      const currentPlayerId = room.players[room.currentPlayerIndex];
      if (socket.id !== currentPlayerId) return; // Not your turn

      const player = room.playerData[currentPlayerId];
      
      // Validate hand
      if (Rules.isWinningHand(player.hand, room.vira)) {
        room.status = 'finished';
        // Reveal all hands
        room.players.forEach(pid => {
          room.playerData[pid].hand.forEach(c => c.isHidden = false);
        });
        
        io.to(roomId).emit('game_over', { winnerId: currentPlayerId, winnerName: player.name });
        emitGameState(io, roomId);
      } else {
        socket.emit('error', 'Mão inválida para bater! Você precisa de trincas ou sequências.');
      }
    });

    socket.on('restart_game', (roomId: string) => {
      const room = rooms[roomId];
      if (room && room.status === 'finished') {
        // Reset game state but keep players
        startGame(room);
        emitGameState(io, roomId);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Simple cleanup: remove player from rooms they are in
      // In a real app, handle reconnection logic
      for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.players.includes(socket.id)) {
          room.players = room.players.filter(id => id !== socket.id);
          delete room.playerData[socket.id];
          if (room.players.length === 0) {
            delete rooms[roomId];
          } else {
            emitGameState(io, roomId);
          }
        }
      }
    });
  });

  function startGame(room: Room) {
    room.status = 'playing';
    room.deck = new Deck(2); // Reset deck
    room.discardPile = [];
    room.currentPlayerIndex = 0;
    room.turnPhase = 'draw';
    
    // Set Vira (Joker indicator)
    room.vira = room.deck.draw();
    if (room.vira) room.vira.isHidden = false;

    // Deal cards (9 cards for Pife usually)
    const handSize = 9;
    room.players.forEach((playerId, index) => {
      const player = room.playerData[playerId];
      player.hand = room.deck.drawMultiple(handSize).map(c => ({...c, isHidden: false})); // Reveal to owner
      player.isTurn = index === 0;
    });
  }

  function emitGameState(io: Server, roomId: string) {
    const room = rooms[roomId];
    if (!room) return;

    // We need to send a sanitized version of the state to each player
    // Players shouldn't see opponents' cards
    room.players.forEach(playerId => {
      const gameState: GameState = {
        roomId: room.id,
        players: room.players.map(pid => {
          const p = room.playerData[pid];
          if (pid === playerId) {
            return p; // Send full data to the owner
          } else {
            // Hide hand for opponents
            return {
              ...p,
              hand: p.hand.map(c => ({ ...c, isHidden: true, suit: 'hearts' as const, rank: 'A' as const, value: 0 })) // Masked cards
            };
          }
        }),
        deckCount: room.deck.remaining,
        discardPile: room.discardPile,
        currentPlayerId: room.players[room.currentPlayerIndex],
        status: room.status,
        gameType: room.gameType,
        turnPhase: room.turnPhase,
        vira: room.vira
      };
      io.to(playerId).emit('game_state_update', gameState);
    });
  }

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', activeRooms: Object.keys(rooms).length });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production (placeholder)
    app.use(express.static('dist'));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

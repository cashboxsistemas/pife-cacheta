import { useEffect, useState } from 'react';
import { socket, connectSocket, disconnectSocket } from '../services/socket';
import { GameState, Card, Player } from '../types/game';
import { motion, Reorder } from 'motion/react';

export default function GameTable() {
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [joinInput, setJoinInput] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [localHand, setLocalHand] = useState<Card[]>([]);

  useEffect(() => {
    connectSocket();

    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onRoomCreated(id: string) {
      setRoomId(id);
    }

    function onGameStateUpdate(state: GameState) {
      setGameState(state);
      setRoomId(state.roomId);
    }

    function onError(msg: string) {
      alert(msg);
    }

    function onGameOver({ winnerName }: { winnerName: string }) {
      alert(`FIM DE JOGO! Vencedor: ${winnerName}`);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_created', onRoomCreated);
    socket.on('game_state_update', onGameStateUpdate);
    socket.on('error', onError);
    socket.on('game_over', onGameOver);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_created', onRoomCreated);
      socket.off('game_state_update', onGameStateUpdate);
      socket.off('error', onError);
      socket.off('game_over', onGameOver);
      disconnectSocket();
    };
  }, []);

  // Sync local hand with game state while preserving order
  useEffect(() => {
    if (!gameState) return;
    const myPlayer = gameState.players.find(p => p.id === socket.id);
    if (!myPlayer) return;

    const serverHand = myPlayer.hand;
    
    setLocalHand(prev => {
      // If first load or empty, just use server hand
      if (prev.length === 0) return serverHand;

      // Keep existing cards in their current order
      const existingIds = new Set(prev.map(c => c.id));
      const newCards = serverHand.filter(c => !existingIds.has(c.id));
      
      // Filter out cards that were removed (discarded)
      const serverIds = new Set(serverHand.map(c => c.id));
      const currentCards = prev.filter(c => serverIds.has(c.id));

      // Append new cards at the end
      return [...currentCards, ...newCards];
    });
  }, [gameState]);

  const createRoom = (type: 'pife' | 'cacheta') => {
    if (!playerName) {
      alert('Por favor, digite seu nome!');
      return;
    }
    socket.emit('create_room', { type, playerName });
  };

  const joinRoom = () => {
    if (!playerName) {
      alert('Por favor, digite seu nome!');
      return;
    }
    if (joinInput) {
      socket.emit('join_room', { roomId: joinInput.toUpperCase(), playerName });
    }
  };

  const startGame = () => {
    if (roomId) {
      socket.emit('start_game', roomId);
    }
  };

  // Helper to get current player
  const myPlayer = gameState?.players.find(p => p.id === socket.id);
  const isMyTurn = myPlayer?.isTurn;
  const canDraw = isMyTurn && gameState?.turnPhase === 'draw';
  const canDiscard = isMyTurn && gameState?.turnPhase === 'discard';

  // Sound Effects
  const playSound = (type: 'draw' | 'discard' | 'shuffle' | 'victory') => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
      case 'draw':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(600, now);
        oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        break;
      case 'discard':
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(400, now);
        oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        oscillator.start(now);
        oscillator.stop(now + 0.15);
        break;
      case 'shuffle':
        // Simulating a shuffle sound with noise buffer would be complex, just a simple trill
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.linearRampToValueAtTime(800, now + 0.3);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;
      case 'victory':
        // Major chord arpeggio
        [440, 554, 659, 880].forEach((freq, i) => {
          const osc = audioCtx.createOscillator();
          const gn = audioCtx.createGain();
          osc.connect(gn);
          gn.connect(audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.value = freq;
          gn.gain.setValueAtTime(0.1, now + i * 0.1);
          gn.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.5);
          osc.start(now + i * 0.1);
          osc.stop(now + i * 0.1 + 0.5);
        });
        return; // Custom handling
    }
  };

  useEffect(() => {
    if (gameState?.status === 'playing') {
      playSound('shuffle');
    }
  }, [gameState?.status]);

  const handleDrawCard = () => {
    if (canDraw && roomId) {
      playSound('draw');
      socket.emit('draw_card', roomId);
    }
  };

  const handleDrawFromDiscard = () => {
    if (canDraw && roomId && gameState?.discardPile.length && gameState.discardPile.length > 0) {
      playSound('draw');
      socket.emit('draw_from_discard', roomId);
    }
  };

  const handleDiscardCard = (cardId: string) => {
    if (canDiscard && roomId) {
      playSound('discard');
      socket.emit('discard_card', { roomId, cardId });
    }
  };

  const handleRestartGame = () => {
    if (roomId) {
      socket.emit('restart_game', roomId);
    }
  };

  const handleDeclareVictory = () => {
    if (isMyTurn && roomId) {
      playSound('victory');
      socket.emit('declare_victory', roomId);
    }
  };

  if (!roomId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-green-800 text-white p-4">
        <h1 className="text-4xl font-bold mb-8">CardVerse</h1>
        
        <div className="bg-green-900/50 p-6 rounded-xl backdrop-blur-sm border border-white/10 w-full max-w-md space-y-6">
          <div className="flex items-center justify-between">
             <span className="text-sm font-mono text-green-300">
              Status: {isConnected ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Seu Nome</h2>
            <input 
              type="text" 
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Digite seu nome"
              className="w-full bg-black/20 border border-white/20 rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Criar Sala</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => createRoom('pife')}
                disabled={!playerName}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors shadow-lg"
              >
                Pife
              </button>
              <button
                onClick={() => createRoom('cacheta')}
                disabled={!playerName}
                className="py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors shadow-lg"
              >
                Cacheta
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/10">
            <h2 className="text-xl font-semibold">Entrar em Sala</h2>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="ID da Sala"
                className="flex-1 bg-black/20 border border-white/20 rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500"
              />
              <button 
                onClick={joinRoom}
                disabled={!playerName}
                className="px-6 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold"
              >
                Entrar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-green-800 text-white overflow-hidden relative">
      {/* Header / Info Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-md p-3 rounded-lg pointer-events-auto">
          <div className="text-xs text-gray-400 uppercase tracking-wider">Sala</div>
          <div className="text-xl font-mono font-bold text-yellow-400">{roomId}</div>
        </div>
        
        {gameState?.status === 'waiting' && (
           <div className="bg-black/40 backdrop-blur-md p-6 rounded-xl pointer-events-auto flex flex-col items-center gap-4">
             <h2 className="text-2xl font-bold">Aguardando Jogadores</h2>
             <div className="text-4xl font-mono">{gameState.players.length}/4</div>
             {gameState.players.length >= 2 && myPlayer?.id === gameState.players[0].id && (
               <button 
                onClick={startGame}
                className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full shadow-lg transform hover:scale-105 transition-all"
               >
                 INICIAR JOGO
               </button>
             )}
             <div className="text-sm text-gray-400">Mínimo 2 jogadores para iniciar</div>
           </div>
        )}
      </div>



      {/* Game Over Modal */}
      {gameState?.status === 'finished' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-green-900 p-8 rounded-2xl border-2 border-yellow-500 text-center shadow-2xl">
              <h2 className="text-4xl font-bold text-yellow-400 mb-4">FIM DE JOGO!</h2>
              <p className="text-xl text-white mb-8">
                Vencedor: {gameState.players.find(p => p.id === gameState.currentPlayerId)?.name}
              </p>
              {myPlayer?.id === gameState.players[0].id && (
                <button 
                  onClick={handleRestartGame}
                  className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full shadow-lg transform hover:scale-105 transition-all"
                >
                  JOGAR NOVAMENTE
                </button>
              )}
            </div>
          </div>
      )}

      {/* Game Area */}
      <div className="flex-1 relative flex items-center justify-center">
        
        {/* Opponents (Simplified layout for now) */}
        {gameState?.players.filter(p => p.id !== socket.id).map((player, idx) => (
          <div key={player.id} className="absolute top-10 transform -translate-x-1/2" style={{ left: `${(idx + 1) * 30}%` }}>
             <div className="flex flex-col items-center">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-gray-700 border-2 border-gray-500 flex items-center justify-center mb-1 md:mb-2">
                  <span className="text-xs md:text-base">{player.name[0]}</span>
                </div>
                <div className="flex -space-x-6 md:-space-x-8">
                  {player.hand.map((card, i) => (
                    <div key={i} className="w-6 h-10 md:w-10 md:h-14 bg-red-900 border border-white/20 rounded shadow-md"></div>
                  ))}
                </div>
                <span className="text-[10px] md:text-xs mt-1 bg-black/50 px-2 rounded">{player.name}</span>
             </div>
          </div>
        ))}

        {/* Center Table (Deck & Discard) */}
        {gameState?.status === 'playing' && (
          <div className="flex gap-4 md:gap-8 items-center">
            {/* Deck */}
            <div 
              onClick={handleDrawCard}
              className={`relative group cursor-pointer transition-transform ${canDraw ? 'hover:scale-105 ring-4 ring-yellow-400 rounded-lg' : 'opacity-80'}`}
            >
              <CardView isBack={true} />
              
              <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border border-white z-20">
                {gameState.deckCount}
              </div>
              {canDraw && (
                <div className="absolute -bottom-8 left-0 right-0 text-center text-yellow-300 font-bold text-xs md:text-sm animate-bounce">
                  COMPRAR
                </div>
              )}
            </div>

            {/* Vira Card */}
            {gameState.vira && (
              <div className="relative transform rotate-12 mx-2">
                <div className="absolute -top-6 left-0 right-0 text-center text-yellow-400 font-bold text-xs uppercase tracking-wider">Vira</div>
                <CardView card={gameState.vira} />
              </div>
            )}

            {/* Discard Pile */}
            <div 
              onClick={handleDrawFromDiscard}
              className={`w-16 h-24 md:w-24 md:h-36 border-2 border-dashed border-white/30 rounded-lg flex items-center justify-center transition-all
                ${canDraw && gameState.discardPile.length > 0 ? 'cursor-pointer hover:border-yellow-400 hover:bg-white/5 ring-2 ring-transparent hover:ring-yellow-400' : ''}
              `}
            >
               {gameState.discardPile.length > 0 ? (
                 <div className="relative">
                    <CardView card={gameState.discardPile[gameState.discardPile.length - 1]} />
                    {canDraw && (
                      <div className="absolute -bottom-8 left-0 right-0 text-center text-yellow-300 font-bold text-xs md:text-sm animate-bounce whitespace-nowrap">
                        PEGAR
                      </div>
                    )}
                 </div>
               ) : (
                 <span className="text-white/20 text-xs md:text-sm">Descarte</span>
               )}
            </div>
          </div>
        )}
      </div>

      {/* My Hand */}
      {myPlayer && (
        <div className="h-56 md:h-72 bg-gradient-to-t from-black/90 to-transparent flex items-end justify-center pb-4 md:pb-8 px-2 md:px-4 relative z-20 w-full overflow-hidden">
           <Reorder.Group 
             axis="x" 
             values={localHand} 
             onReorder={setLocalHand}
             className="flex -space-x-8 md:-space-x-12 hover:-space-x-6 md:hover:-space-x-8 transition-all duration-300 p-4 pt-12 md:p-6 md:pt-16 overflow-x-auto w-full justify-center md:justify-center min-w-min no-scrollbar"
             style={{ maxWidth: '100vw' }}
           >
             {localHand.map((card) => (
               <Reorder.Item
                 key={card.id}
                 value={card}
                 initial={{ y: 100, opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 whileHover={{ y: -20, zIndex: 20 }}
                 whileDrag={{ scale: 1.1, zIndex: 50 }}
                 className={`relative flex-shrink-0 ${canDiscard ? 'cursor-pointer' : ''}`}
               >
                 <div onClick={() => handleDiscardCard(card.id)}>
                    <CardView card={card} />
                 </div>
                 {canDiscard && (
                    <div className="absolute inset-0 hover:bg-red-500/20 rounded-lg transition-colors pointer-events-none" />
                 )}
               </Reorder.Item>
             ))}
           </Reorder.Group>
           
           {isMyTurn && (
             <div className="absolute bottom-28 md:bottom-24 right-4 md:right-10 bg-black/60 p-3 md:p-4 rounded-lg backdrop-blur text-center flex flex-col gap-2 z-30">
               <div className="text-yellow-400 font-bold text-lg md:text-xl mb-1">SUA VEZ</div>
               <div className="text-xs md:text-sm text-white">
                 {gameState?.turnPhase === 'draw' ? 'Compre uma carta' : 'Descarte uma carta'}
               </div>
               
               <button
                 onClick={handleDeclareVictory}
                 className="mt-1 md:mt-2 px-3 md:px-4 py-1 md:py-2 bg-green-600 hover:bg-green-500 text-white font-bold text-sm md:text-base rounded shadow-lg animate-pulse"
               >
                 BATER!
               </button>
             </div>
           )}
        </div>
      )}
    </div>
  );
}

function CardView({ card, isBack = false, onClick }: { card?: Card; isBack?: boolean; onClick?: () => void }) {
  // Classic card back pattern using CSS
  const cardBackStyle = {
    backgroundImage: `
      repeating-linear-gradient(45deg, #8b0000 0, #8b0000 10px, #a52a2a 10px, #a52a2a 20px),
      repeating-linear-gradient(-45deg, #8b0000 0, #8b0000 10px, #a52a2a 10px, #a52a2a 20px)
    `,
    backgroundBlendMode: 'multiply'
  };

  if (isBack || !card) {
    return (
      <div 
        onClick={onClick}
        className="w-16 h-24 md:w-24 md:h-36 rounded-lg shadow-xl border-2 border-white/20 flex items-center justify-center relative overflow-hidden bg-red-900"
      >
        <div className="absolute inset-2 border border-white/30 rounded opacity-50" />
        <div className="absolute inset-0 opacity-30" style={cardBackStyle} />
        <div className="w-8 h-8 md:w-12 md:h-12 bg-red-950/50 rounded-full flex items-center justify-center backdrop-blur-sm z-10 border border-white/10">
          <span className="text-white/50 text-xs md:text-sm font-serif">CV</span>
        </div>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitIcon = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  }[card.suit];

  return (
    <div 
      onClick={onClick}
      className={`
      w-16 h-24 md:w-24 md:h-36 bg-white rounded-lg shadow-xl border border-gray-200 
      flex flex-col justify-between p-1 md:p-2 select-none cursor-pointer relative
      ${isRed ? 'text-red-600' : 'text-black'}
    `}>
      <div className="text-sm md:text-lg font-bold leading-none text-left">
        {card.rank}
        <div className="text-[10px] md:text-sm">{suitIcon}</div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-2xl md:text-4xl opacity-20 md:opacity-100">{suitIcon}</div>
      </div>
      <div className="text-sm md:text-lg font-bold leading-none text-right transform rotate-180">
        {card.rank}
        <div className="text-[10px] md:text-sm">{suitIcon}</div>
      </div>
    </div>
  );
}

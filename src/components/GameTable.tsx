import { useEffect, useState } from 'react';
import { socket, connectSocket, disconnectSocket } from '../services/socket';
import { GameState, Card, Player } from '../types/game';
import { motion, Reorder, AnimatePresence } from 'motion/react';

export default function GameTable() {
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [joinInput, setJoinInput] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [localHand, setLocalHand] = useState<Card[]>([]);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    connectSocket();
    function onConnect() { setIsConnected(true); }
    function onDisconnect() { setIsConnected(false); }
    function onRoomCreated(id: string) { setRoomId(id); }
    function onGameStateUpdate(state: GameState) {
      setGameState(state);
      setRoomId(state.roomId);
      if (state.status !== 'finished') setWinnerName(null);
    }
    function onError(msg: string) { alert(msg); }
    function onGameOver({ winnerName }: { winnerName: string }) { setWinnerName(winnerName); }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_created', onRoomCreated);
    socket.on('game_state_update', onGameStateUpdate);
    socket.on('error', onError);
    socket.on('game_over', onGameOver);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_created', onRoomCreated);
      socket.off('game_state_update', onGameStateUpdate);
      socket.off('error', onError);
      socket.off('game_over', onGameOver);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    if (!gameState) return;
    const myPlayer = gameState.players.find(p => p.id === socket.id);
    if (!myPlayer) return;
    const serverHand = myPlayer.hand;

    setLocalHand(prev => {
      if (prev.length === 0) return serverHand;
      const existingIds = new Set(prev.map(c => c.id));
      const newCards = serverHand.filter(c => !existingIds.has(c.id));
      const serverIds = new Set(serverHand.map(c => c.id));
      const currentCards = prev.filter(c => serverIds.has(c.id));
      return [...currentCards, ...newCards];
    });
  }, [gameState]);

  const createRoom = (type: 'pife' | 'cacheta') => {
    if (!playerName) { alert('Digite seu nome!'); return; }
    socket.emit('create_room', { type, playerName });
  };

  const joinRoom = () => {
    if (!playerName) { alert('Digite seu nome!'); return; }
    if (joinInput) socket.emit('join_room', { roomId: joinInput.toUpperCase(), playerName });
  };

  const startGame = () => { if (roomId) socket.emit('start_game', roomId); };
  const playAgain = () => { if (roomId) socket.emit('restart_game', roomId); };

  const handleDrawCard = () => { if (gameState?.status === 'playing' && roomId) socket.emit('draw_card', roomId); };
  const handleDrawFromDiscard = () => { if (gameState?.status === 'playing' && roomId && gameState.discardPile.length) socket.emit('draw_from_discard', roomId); };
  const handleDiscardCard = (cardId: string) => { if (gameState?.status === 'playing' && roomId) socket.emit('discard_card', { roomId, cardId }); };
  const handleDeclareVictory = () => { if (roomId) socket.emit('declare_victory', roomId); };

  const myPlayer = gameState?.players.find(p => p.id === socket.id);
  const isMyTurn = myPlayer?.isTurn;
  const canDraw = isMyTurn && gameState?.turnPhase === 'draw';
  const canDiscard = isMyTurn && gameState?.turnPhase === 'discard';

  // Position logic for players (Portrait)
  const getOrderedPlayers = () => {
    if (!gameState) return [];
    const myIndex = gameState.players.findIndex(p => p.id === socket.id);
    if (myIndex === -1) return gameState.players;
    const ordered = [];
    for (let i = 0; i < gameState.players.length; i++) {
      ordered.push(gameState.players[(myIndex + i) % gameState.players.length]);
    }
    return ordered;
  };

  const orderedPlayers = getOrderedPlayers();
  const playersByPos: { [key: string]: Player } = {};
  if (orderedPlayers.length === 2) {
    playersByPos.bottom = orderedPlayers[0];
    playersByPos.top = orderedPlayers[1];
  } else if (orderedPlayers.length === 3) {
    playersByPos.bottom = orderedPlayers[0];
    playersByPos.left = orderedPlayers[1];
    playersByPos.top = orderedPlayers[2];
  } else if (orderedPlayers.length === 4) {
    playersByPos.bottom = orderedPlayers[0];
    playersByPos.left = orderedPlayers[1];
    playersByPos.top = orderedPlayers[2];
    playersByPos.right = orderedPlayers[3];
  }

  if (!roomId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07633d] text-white p-6 text-center overflow-hidden">
        <h1 className="text-5xl font-black mb-12 italic text-yellow-500 drop-shadow-lg uppercase tracking-tighter">Nick’s Deck</h1>
        <div className="bg-black/20 p-8 rounded-[2.5rem] backdrop-blur-md border border-white/10 w-full max-w-sm space-y-8 shadow-2xl">
          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-gray-400 tracking-widest">Seu Nome</label>
            <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-white/10 border-2 border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-yellow-500 text-center text-xl font-bold transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => createRoom('pife')} className="py-4 bg-emerald-600 rounded-2xl font-black text-lg shadow-xl uppercase active:scale-95 transition-transform">Pife</button>
            <button onClick={() => createRoom('cacheta')} className="py-4 bg-blue-600 rounded-2xl font-black text-lg shadow-xl uppercase active:scale-95 transition-transform">Cacheta</button>
          </div>
          <div className="pt-6 border-t border-white/10 space-y-4">
            <input type="text" value={joinInput} onChange={e => setJoinInput(e.target.value)} placeholder="Código da Sala" className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-center uppercase font-mono text-lg" />
            <button onClick={joinRoom} className="w-full py-4 bg-gray-700/50 hover:bg-gray-700 rounded-2xl font-black uppercase transition-colors">Entrar na Sala</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#07633d] text-white overflow-hidden relative font-sans select-none">
      {/* Table Green Felt Texture */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '30px 30px' }} />

      {/* Waiting Room Overlay */}
      {gameState?.status === 'waiting' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md p-6">
          <div className="bg-[#0b4d31] p-10 rounded-[3.5rem] border-4 border-white/5 flex flex-col items-center gap-8 shadow-2xl max-w-sm w-full">
            <div className="text-center">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Sala</span>
              <div className="text-6xl font-mono font-black text-yellow-500 mt-2 tracking-tighter">{roomId}</div>
            </div>
            <div className="flex items-center gap-4 py-2 px-6 bg-black/20 rounded-full border border-white/10">
              <span className="text-2xl font-black text-white">{gameState.players.length}/4</span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            {gameState.players.length >= 2 && myPlayer?.id === gameState.players[0].id ? (
              <button onClick={startGame} className="w-full py-5 bg-yellow-500 text-black font-black text-2xl rounded-3xl shadow-[0_8px_0_#a16207] active:translate-y-1 active:shadow-none transition-all uppercase tracking-tighter">Começar Jogo</button>
            ) : (
              <div className="py-4 px-8 bg-black/20 rounded-2xl border border-white/5 text-center">
                <p className="text-yellow-500/80 font-black animate-pulse text-sm uppercase tracking-widest">Aguardando Host</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameState?.status === 'finished' && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="bg-[#0b4d31] p-12 rounded-[4rem] border-4 border-yellow-500 text-center shadow-2xl w-full max-w-sm">
            <h2 className="text-6xl font-black text-yellow-400 mb-2 uppercase italic tracking-tighter">Bateu!</h2>
            <div className="h-1 w-20 bg-yellow-500/30 mx-auto mb-6" />
            <p className="text-3xl font-black text-white mb-10">{winnerName}</p>
            {myPlayer?.id === gameState.players[0].id && (
              <button onClick={playAgain} className="w-full py-5 bg-yellow-500 text-black font-black text-xl rounded-3xl shadow-xl hover:scale-105 transition-all uppercase tracking-tight">Nova Partida</button>
            )}
          </div>
        </div>
      )}

      {/* Interface Elements */}
      <div className="p-5 flex justify-between items-start z-20 relative">
        <div className="bg-black/30 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 shadow-lg">
          <div className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mb-0.5">Mesa</div>
          <div className="font-mono font-black text-yellow-400 text-xl tracking-tight">{roomId}</div>
          <div className="text-[8px] text-emerald-400 font-bold uppercase mt-1 opacity-60 tracking-widest border-t border-white/5 pt-1">{gameState?.gameType}</div>
        </div>

        <button className="w-12 h-12 bg-black/30 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10 shadow-lg active:scale-95 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
      </div>

      {/* Joker / Vira Slot (Fixed Top Left) */}
      {gameState?.vira && (
        <div className="absolute top-28 left-5 z-10 flex flex-col items-center">
          <div className="bg-black/40 px-3 py-1 rounded-t-xl text-[9px] font-black text-yellow-500 uppercase tracking-[0.2em] border-x border-t border-white/10 backdrop-blur-sm">Curinga</div>
          <div className="scale-[0.85] origin-top drop-shadow-2xl">
            <CardView card={gameState.vira} />
          </div>
        </div>
      )}

      {/* Table Canvas */}
      <div className="flex-1 relative">

        {/* PLAYER: TOP */}
        {playersByPos.top && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
            <div className="flex -space-x-5 mb-3 scale-90">
              {playersByPos.top.hand.map((_, i) => (
                <div key={i} className="w-10 h-14 bg-[#1e3a5f] border-2 border-white/10 rounded-lg shadow-xl" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #1e3a5f 0, #1e3a5f 5px, #2d5a88 5px, #2d5a88 10px)' }} />
              ))}
            </div>
            <PlayerAvatar player={playersByPos.top} />
          </div>
        )}

        {/* PLAYER: LEFT */}
        {playersByPos.left && (
          <div className="absolute left-4 top-[40%] -translate-y-1/2 flex items-center gap-4 z-10">
            <div className="flex flex-col -space-y-10 scale-90">
              {playersByPos.left.hand.map((_, i) => (
                <div key={i} className="w-14 h-10 bg-[#1e3a5f] border-2 border-white/10 rounded-lg shadow-xl" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #1e3a5f 0, #1e3a5f 5px, #2d5a88 5px, #2d5a88 10px)' }} />
              ))}
            </div>
            <PlayerAvatar player={playersByPos.left} />
          </div>
        )}

        {/* PLAYER: RIGHT */}
        {playersByPos.right && (
          <div className="absolute right-4 top-[40%] -translate-y-1/2 flex flex-row-reverse items-center gap-4 z-10">
            <div className="flex flex-col -space-y-10 scale-90">
              {playersByPos.right.hand.map((_, i) => (
                <div key={i} className="w-14 h-10 bg-[#1e3a5f] border-2 border-white/10 rounded-lg shadow-xl" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #1e3a5f 0, #1e3a5f 5px, #2d5a88 5px, #2d5a88 10px)' }} />
              ))}
            </div>
            <PlayerAvatar player={playersByPos.right} />
          </div>
        )}

        {/* CENTER TABLE: DECK & DISCARD */}
        {gameState?.status === 'playing' && (
          <div className="absolute inset-0 flex items-center justify-center gap-8 md:gap-12 pointer-events-none">
            {/* Draw Deck */}
            <div onClick={handleDrawCard} className={`pointer-events-auto relative group cursor-pointer active:scale-95 transition-transform ${canDraw ? 'ring-4 ring-yellow-400 rounded-3xl' : ''}`}>
              <div className="w-24 h-32 md:w-32 md:h-44 bg-[#1e3a5f] rounded-3xl border-2 border-white/20 shadow-2xl flex items-center justify-center font-black text-5xl text-white/20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #1e3a5f 0, #1e3a5f 15px, #2d5a88 15px, #2d5a88 30px)' }}>
                {gameState.deckCount}
              </div>
              {canDraw && <div className="absolute -bottom-10 left-0 right-0 text-center text-yellow-400 font-black text-xs animate-bounce tracking-widest uppercase">Comprar</div>}
            </div>

            {/* Discard Pile */}
            <div onClick={handleDrawFromDiscard} className={`pointer-events-auto w-24 h-32 md:w-32 md:h-44 border-4 border-dashed border-white/10 rounded-3xl flex items-center justify-center transition-all ${canDraw && gameState.discardPile.length > 0 ? 'cursor-pointer border-yellow-400 bg-white/5 shadow-[0_0_30px_rgba(250,204,21,0.2)]' : ''}`}>
              <AnimatePresence mode="popLayout">
                {gameState.discardPile.length > 0 ? (
                  <motion.div key={gameState.discardPile[gameState.discardPile.length - 1].id} initial={{ scale: 0.8, opacity: 0, rotate: -15 }} animate={{ scale: 1, opacity: 1, rotate: 5 }} className="relative">
                    <CardView card={gameState.discardPile[gameState.discardPile.length - 1]} />
                    {canDraw && <div className="absolute -bottom-10 left-0 right-0 text-center text-yellow-400 font-black text-xs animate-bounce tracking-widest uppercase">Pegar</div>}
                  </motion.div>
                ) : (
                  <div className="opacity-10 text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM SECTION: PLAYER STATUS AND HAND */}
      <div className="relative pb-16 pt-10 px-4 flex flex-col items-center">

        {/* User Info & Turn Overlay */}
        <div className="w-full flex justify-between items-end mb-4 max-w-lg px-2">
          {myPlayer && <PlayerAvatar player={myPlayer} large />}

          <AnimatePresence>
            {isMyTurn && (
              <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }} className="flex flex-col items-end gap-3 translate-y-[-10px]">
                <div className="bg-black/70 backdrop-blur-xl px-5 py-3 rounded-2xl border-2 border-yellow-500 shadow-2xl">
                  <div className="text-yellow-500 font-black text-xs uppercase tracking-[0.2em] mb-1">Sua Vez</div>
                  <div className="text-white text-[10px] font-bold opacity-80">
                    {gameState?.turnPhase === 'draw' ? 'Compre uma carta' : 'Descarte para passar'}
                  </div>
                </div>
                <button onClick={handleDeclareVictory} className="px-8 py-3 bg-emerald-600 border-2 border-white/20 rounded-2xl font-black text-white shadow-[0_6px_0_#065f46] active:translate-y-1 active:shadow-none transition-all uppercase tracking-tighter text-lg">Bater!</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Hand Visualization (Curved Arc) */}
        {myPlayer && (
          <div className="w-full flex justify-center h-48 md:h-64 relative">
            <Reorder.Group axis="x" values={localHand} onReorder={setLocalHand} className="flex -space-x-14 md:-space-x-20 pt-12 min-w-max">
              {localHand.map((card, idx) => {
                const mid = (localHand.length - 1) / 2;
                const offset = idx - mid;
                const rotation = offset * 5.5; // Fan out angle
                const yPos = Math.abs(offset) * 12; // Curve depth

                return (
                  <Reorder.Item key={card.id} value={card} initial={{ y: 200, opacity: 0 }} animate={{ y: yPos, rotate: rotation, opacity: 1 }} whileHover={{ y: yPos - 60, scale: 1.15, zIndex: 100 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className="cursor-pointer active:cursor-grabbing">
                    <div onClick={() => handleDiscardCard(card.id)} className="drop-shadow-2xl">
                      <CardView card={card} />
                    </div>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerAvatar({ player, large = false }: { player: Player, large?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${player.isTurn ? 'scale-110' : ''} transition-all duration-500`}>
      <div className="relative">
        <div className={`${large ? 'w-20 h-20' : 'w-16 h-16'} rounded-full bg-gradient-to-br from-yellow-100 to-orange-200 border-4 ${player.isTurn ? 'border-yellow-400 shadow-[0_0_25px_rgba(250,204,21,0.6)]' : 'border-white/20'} overflow-hidden flex items-center justify-center p-1`}>
          <div className="w-full h-full rounded-full bg-emerald-950/40 flex items-center justify-center text-4xl opacity-50 grayscale">
            👤
          </div>
        </div>
        <div className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-black min-w-[24px] h-[24px] rounded-full flex items-center justify-center border-2 border-[#07633d] shadow-lg px-1">
          {player.hand.length}
        </div>
      </div>
      <div className="bg-black/50 backdrop-blur-md px-4 py-1 rounded-full text-[10px] font-black border border-white/10 uppercase tracking-widest max-w-[100px] truncate shadow-lg">
        {player.name}
      </div>
    </div>
  );
}

function CardView({ card, isBack = false }: { card?: Card; isBack?: boolean }) {
  if (isBack || !card) {
    return (
      <div className="w-20 h-28 md:w-32 md:h-44 bg-[#1e3a5f] rounded-2xl border-2 border-white/20 shadow-2xl overflow-hidden relative" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #1e3a5f 0, #1e3a5f 10px, #2d5a88 10px, #2d5a88 20px)' }}>
        <div className="absolute inset-3 border-2 border-white/10 rounded-xl opacity-20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 md:w-16 md:h-16 bg-white/5 rounded-full border border-white/10 flex items-center justify-center">
            <span className="text-white/20 font-black text-xs md:text-xl">ND</span>
          </div>
        </div>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitIcon = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[card.suit];

  return (
    <div className={`w-20 h-28 md:w-32 md:h-44 bg-white rounded-2xl border border-gray-100 flex flex-col justify-between p-2 md:p-4 shadow-2xl select-none ${isRed ? 'text-red-600' : 'text-slate-900'} relative overflow-hidden`}>
      <div className="flex justify-between items-start">
        <div className="text-xl md:text-4xl font-black leading-none tracking-tighter">
          {card.rank}
          <div className="text-sm md:text-xl mt-[-2px]">{suitIcon}</div>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-6xl md:text-8xl opacity-[0.05]">{suitIcon}</div>
      </div>

      <div className="flex justify-end items-end rotate-180">
        <div className="text-xl md:text-4xl font-black leading-none tracking-tighter">
          {card.rank}
          <div className="text-sm md:text-xl mt-[-2px]">{suitIcon}</div>
        </div>
      </div>
    </div>
  );
}

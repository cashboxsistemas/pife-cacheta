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
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);

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
      if (state.status !== 'finished') {
        setWinnerName(null);
      }
    }

    function onError(msg: string) {
      alert(msg);
    }

    function onGameOver({ winnerName }: { winnerName: string }) {
      setWinnerName(winnerName);
    }

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

    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('resize', handleResize);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_created', onRoomCreated);
      socket.off('game_state_update', onGameStateUpdate);
      socket.off('error', onError);
      socket.off('game_over', onGameOver);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('resize', handleResize);
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
      if (prev.length === 0) return serverHand;
      const existingIds = new Set(prev.map(c => c.id));
      const newCards = serverHand.filter(c => !existingIds.has(c.id));
      const serverIds = new Set(serverHand.map(c => c.id));
      const currentCards = prev.filter(c => serverIds.has(c.id));
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

  const myPlayer = gameState?.players.find(p => p.id === socket.id);
  const isMyTurn = myPlayer?.isTurn;
  const canDraw = isMyTurn && gameState?.turnPhase === 'draw';
  const canDiscard = isMyTurn && gameState?.turnPhase === 'discard';

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
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, now);
        oscillator.frequency.linearRampToValueAtTime(800, now + 0.3);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;
      case 'victory':
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
        break;
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

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  if (!roomId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-green-800 text-white p-4 text-center">
        <h1 className="text-5xl font-black mb-8 italic tracking-tighter text-yellow-500 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] uppercase">
          Nick’s Deck
        </h1>

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

        {showInstallBtn && (
          <button
            onClick={handleInstallClick}
            className="mt-8 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-full shadow-lg flex items-center gap-2 animate-bounce border-2 border-black"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            INSTALAR APP
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-green-800 text-white overflow-hidden relative">
      {isPortrait && gameState?.status === 'playing' && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-center lg:hidden">
          <div className="animate-bounce mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="yellow" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-90"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-yellow-500 mb-2">Gire seu dispositivo</h2>
          <p className="text-gray-400">Para uma melhor experiência, use o modo paisagem.</p>
        </div>
      )}

      {/* Header / Info Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-md p-3 rounded-lg pointer-events-auto">
          <div className="text-xs text-gray-400 uppercase tracking-wider">Sala</div>
          <div className="text-xl font-mono font-bold text-yellow-400">{roomId}</div>
          {gameState && (
            <div className="text-[10px] text-emerald-400 font-bold uppercase mt-1 border-t border-white/10 pt-1">
              {gameState.gameType}
            </div>
          )}
        </div>
      </div>

      {/* Waiting Room Modal */}
      {gameState?.status === 'waiting' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-green-900/95 p-4 rounded-[2rem] border-2 border-white/10 flex flex-col items-center gap-3 shadow-2xl max-w-sm w-full mx-4 overflow-y-auto max-h-[90dvh]">
            <div className="w-full flex flex-col items-center gap-1 text-center">
              <span className="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-bold">Código da Sala</span>
              <div className="text-4xl font-mono font-black text-yellow-500 tracking-tighter bg-black/40 px-5 py-3 rounded-2xl border border-white/10 shadow-inner">
                {roomId}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomId || '');
                  alert('Código copiado!');
                }}
                className="mt-2 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-bold transition-all active:scale-95 border border-white/5 uppercase"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                Copiar Código
              </button>
            </div>

            <div className="w-full h-px bg-white/10" />

            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex flex-col items-center">
                <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/30 mb-2">
                  {gameState.gameType}
                </div>
                <h2 className="text-xl font-bold text-white">Sala de Espera</h2>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">{gameState.players.length}</span>
                <span className="text-lg text-gray-500 font-bold">/ 4</span>
              </div>

              {gameState.players.length >= 2 && myPlayer?.id === gameState.players[0].id ? (
                <button
                  onClick={startGame}
                  className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black font-black text-lg rounded-2xl shadow-[0_4px_0_rgb(161,98,7)] transition-all uppercase tracking-tight"
                >
                  INICIAR JOGO
                </button>
              ) : (
                <div className="w-full py-3 px-6 bg-black/20 rounded-2xl border border-white/5 text-center">
                  <p className="text-xs text-yellow-500/80 font-bold animate-pulse">
                    {gameState.players.length < 2
                      ? "Aguardando competidores..."
                      : "Aguardando o anfitrião..."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameState?.status === 'finished' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-green-900 p-8 rounded-2xl border-2 border-yellow-500 text-center shadow-2xl">
            <h2 className="text-4xl font-bold text-yellow-400 mb-4">FIM DE JOGO!</h2>
            <p className="text-xl text-white mb-8">
              Vencedor: {winnerName || 'Ninguém?'}
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
        {/* Opponents */}
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

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number; // For scoring
  isHidden?: boolean; // For opponent cards
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  isTurn: boolean;
  score: number;
}

export interface GameState {
  roomId: string;
  players: Player[];
  deckCount: number;
  discardPile: Card[];
  currentPlayerId: string;
  status: 'waiting' | 'playing' | 'finished';
  gameType: 'pife' | 'cacheta';
  turnPhase: 'draw' | 'discard';
}

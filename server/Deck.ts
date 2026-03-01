import { Card, Suit, Rank } from '../src/types/game';
import { v4 as uuidv4 } from 'uuid';

export class Deck {
  private cards: Card[] = [];

  constructor(deckCount: number = 1) {
    this.initialize(deckCount);
  }

  private initialize(deckCount: number) {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    for (let i = 0; i < deckCount; i++) {
      for (const suit of suits) {
        for (const rank of ranks) {
          this.cards.push({
            id: uuidv4(),
            suit,
            rank,
            value: this.getRankValue(rank),
            isHidden: true // Default state for deck cards
          });
        }
      }
    }
    this.shuffle();
  }

  private getRankValue(rank: Rank): number {
    if (rank === 'A') return 1;
    if (['J', 'Q', 'K'].includes(rank)) return 10;
    return parseInt(rank);
  }

  public shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  public draw(): Card | undefined {
    return this.cards.pop();
  }

  public drawMultiple(count: number): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      const card = this.draw();
      if (card) drawn.push(card);
    }
    return drawn;
  }

  public get remaining(): number {
    return this.cards.length;
  }
}

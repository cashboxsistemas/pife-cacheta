import { Card, Rank } from '../../src/types/game';

type Group = Card[];

export class Rules {
  static isWinningHand(hand: Card[], vira?: Card): boolean {
    if (hand.length < 9) return false;

    // Identify Jokers
    let jokerRank: Rank | null = null;
    if (vira) {
      jokerRank = this.getNextRank(vira.rank);
    }

    // Try winning with exactly these cards
    if (this.validateFullHand(hand, jokerRank)) return true;

    // If we have 10+ cards, we might win by discarding one
    if (hand.length >= 10) {
      for (let i = 0; i < hand.length; i++) {
        const reducedHand = [...hand.slice(0, i), ...hand.slice(i + 1)];
        if (this.validateFullHand(reducedHand, jokerRank)) return true;
      }
    }

    return false;
  }

  private static validateFullHand(hand: Card[], jokerRank: Rank | null): boolean {
    const nonJokers = hand.filter(c => c.rank !== jokerRank);
    const jokerCount = hand.length - nonJokers.length;

    // Sort for stable processing
    nonJokers.sort((a, b) => {
      if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
      return this.getRankIndex(a.rank) - this.getRankIndex(b.rank);
    });

    return this.canFormSetsRecursion(nonJokers, jokerCount);
  }

  private static canFormSetsRecursion(cards: Card[], jokerCount: number): boolean {
    if (cards.length === 0) return jokerCount % 3 === 0;

    const first = cards[0];

    // --- Try Triple (Same Rank) ---
    const sameRank = cards.filter(c => c.rank === first.rank && c.id !== first.id);
    // Triples can be size 3 or 4
    for (const size of [4, 3]) {
      const neededOthers = size - 1;
      for (let k = Math.min(sameRank.length, neededOthers); k >= 0; k--) {
        const jokersNeeded = neededOthers - k;
        if (jokersNeeded <= jokerCount) {
          const combos = this.getCombinations(sameRank, k);
          for (const combo of combos) {
            const remaining = this.removeCards(cards, [first, ...combo]);
            if (this.canFormSetsRecursion(remaining, jokerCount - jokersNeeded)) return true;
          }
        }
      }
    }

    // --- Try Straight (Same Suit) ---
    const firstIdx = this.getRankIndex(first.rank);
    // Sequences can be size 3 up to 10
    for (let L = 10; L >= 3; L--) {
      for (let pos = 0; pos < L; pos++) {
        const startIdx = firstIdx - pos;
        if (startIdx < 1 || startIdx + L - 1 > 13) continue;

        let jokersNeeded = 0;
        const usedCards: Card[] = [];

        for (let i = 0; i < L; i++) {
          const targetIdx = startIdx + i;
          if (targetIdx === firstIdx && !usedCards.some(u => u.id === first.id)) {
            usedCards.push(first);
            continue;
          }

          const found = cards.find(c =>
            c.suit === first.suit &&
            this.getRankIndex(c.rank) === targetIdx &&
            !usedCards.some(u => u.id === c.id)
          );

          if (found) {
            usedCards.push(found);
          } else {
            jokersNeeded++;
          }
        }

        if (jokersNeeded <= jokerCount && usedCards.some(u => u.id === first.id)) {
          const remaining = this.removeCards(cards, usedCards);
          if (this.canFormSetsRecursion(remaining, jokerCount - jokersNeeded)) return true;
        }
      }
    }

    return false;
  }

  private static getNextRank(rank: Rank): Rank {
    const order: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const idx = order.indexOf(rank);
    return order[(idx + 1) % order.length];
  }

  private static getCombinations<T>(arr: T[], size: number): T[][] {
    if (size === 0) return [[]];
    if (arr.length === 0) return [];

    const first = arr[0];
    const rest = arr.slice(1);

    const combsWithFirst = this.getCombinations(rest, size - 1).map(c => [first, ...c]);
    const combsWithoutFirst = this.getCombinations(rest, size);

    return [...combsWithFirst, ...combsWithoutFirst];
  }

  private static removeCards(source: Card[], toRemove: Card[]): Card[] {
    const idsToRemove = new Set(toRemove.map(c => c.id));
    return source.filter(c => !idsToRemove.has(c.id));
  }

  private static getRankIndex(rank: Rank): number {
    const order: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return order.indexOf(rank) + 1;
  }
}

import { Card, Rank } from '../../src/types/game';

type Group = Card[];

export class Rules {
  static isWinningHand(hand: Card[], vira?: Card): boolean {
    // Basic Pife logic: Hand must be formed entirely by valid sets (triples or straights)
    // usually 9 or 10 cards.
    if (hand.length < 9) return false;

    // Identify Jokers
    let jokerRank: Rank | null = null;
    if (vira) {
      jokerRank = this.getNextRank(vira.rank);
    }

    const nonJokers = hand.filter(c => c.rank !== jokerRank);
    const jokerCount = hand.length - nonJokers.length;

    return this.canFormSets(nonJokers, jokerCount);
  }

  private static getNextRank(rank: Rank): Rank {
    const order: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const idx = order.indexOf(rank);
    return order[(idx + 1) % order.length];
  }

  private static canFormSets(cards: Card[], jokerCount: number): boolean {
    if (cards.length === 0 && jokerCount === 0) return true;
    
    // If we have no cards but have jokers, it's valid (jokers can form a set by themselves technically, 
    // or rather, they are used up). 
    // Actually, a set of 3 jokers is valid? Usually yes.
    // But our recursion consumes cards. If cards are empty, we must check if jokers are divisible by 3?
    // Or simply, if we cleared all non-jokers, the remaining jokers can form sets if count % 3 == 0?
    // Or maybe jokers can just be attached to anything.
    // Let's assume if cards are empty, we need jokerCount % 3 === 0 or just return true if we assume jokers are wild enough.
    // Stricter rule: Jokers must be part of a set.
    if (cards.length === 0) return jokerCount % 3 === 0;

    const first = cards[0];
    const rest = cards.slice(1);

    // --- Try to form a Triple (Same Rank) ---
    // We need 3 cards of same rank.
    // We have 'first'. We need 2 more.
    // They can be from 'rest' (same rank) or Jokers.
    
    const sameRank = rest.filter(c => c.rank === first.rank);
    
    // We can use 0, 1, or 2 cards from sameRank, and fill rest with Jokers.
    // Max size of a set is usually 3 or 4. Let's aim for 3 minimum.
    
    // Option T1: first + 2 others (0 jokers)
    // Option T2: first + 1 other + 1 joker
    // Option T3: first + 2 jokers
    
    // Try forming a group of size 3 using k cards from sameRank and (2-k) jokers
    // We can also form bigger groups, but let's stick to 3 for basic Pife.
    
    // Try using 'first' + combinations of 'sameRank'
    // We iterate through all subsets of sameRank that, combined with jokers, make a set of 3+.
    
    // Simplified: Try to form a set of exactly 3 cards (Rank-based)
    // 1. first + 2 from sameRank
    if (sameRank.length >= 2) {
       const combos = this.getCombinations(sameRank, 2);
       for (const combo of combos) {
         const remaining = this.removeCards(cards, [first, ...combo]);
         if (this.canFormSets(remaining, jokerCount)) return true;
       }
    }
    
    // 2. first + 1 from sameRank + 1 Joker
    if (sameRank.length >= 1 && jokerCount >= 1) {
       const combos = this.getCombinations(sameRank, 1);
       for (const combo of combos) {
         const remaining = this.removeCards(cards, [first, ...combo]);
         if (this.canFormSets(remaining, jokerCount - 1)) return true;
       }
    }

    // 3. first + 2 Jokers
    if (jokerCount >= 2) {
       const remaining = this.removeCards(cards, [first]);
       if (this.canFormSets(remaining, jokerCount - 2)) return true;
    }


    // --- Try to form a Straight (Same Suit, Sequence) ---
    // We need 3 cards in sequence.
    // 'first' is one of them.
    // It could be the start, middle, or end.
    // But since we sort or process in order, let's try to build a sequence starting at 'first' or where 'first' is the lowest non-joker.
    
    const sameSuit = rest.filter(c => c.suit === first.suit);
    // Sort sameSuit by rank value
    const sortedSuit = [first, ...sameSuit].sort((a, b) => this.getRankIndex(a.rank) - this.getRankIndex(b.rank));
    
    // We need to find a sequence of length 3+ that includes 'first' and uses jokers for gaps.
    // Since 'first' is in sortedSuit, let's try to build sequences that INCLUDE 'first'.
    
    // We can try to find a sequence of 3 cards:
    // [first, first+1, first+2]
    // [first-1, first, first+1]
    // [first-2, first-1, first]
    
    // Check if we have the needed cards or jokers.
    const firstIdx = this.getRankIndex(first.rank);
    
    // Possible start positions relative to 'first': 0 (first is start), -1 (first is 2nd), -2 (first is 3rd)
    for (let offset = 0; offset >= -2; offset--) {
      const startRankIdx = firstIdx + offset;
      // Valid ranks are 1 to 13
      if (startRankIdx < 1 || startRankIdx + 2 > 13) continue;
      
      // We need cards with rank indices: startRankIdx, startRankIdx+1, startRankIdx+2
      const neededIndices = [startRankIdx, startRankIdx+1, startRankIdx+2];
      
      let jokersNeeded = 0;
      const cardsUsed: Card[] = [];
      let possible = true;
      
      for (const idx of neededIndices) {
        if (idx === firstIdx) {
          cardsUsed.push(first);
          continue;
        }
        
        // Find card with this rank in sameSuit (excluding 'first' which is already used conceptually, but we are looking in sortedSuit which has it)
        // We need to pick a card from 'sortedSuit' that matches 'idx' and is NOT 'first' (or already used)
        // Actually, 'first' is the one we are processing.
        
        const found = sortedSuit.find(c => this.getRankIndex(c.rank) === idx && c.id !== first.id && !cardsUsed.some(u => u.id === c.id));
        if (found) {
          cardsUsed.push(found);
        } else {
          jokersNeeded++;
        }
      }
      
      if (jokersNeeded <= jokerCount) {
        const remaining = this.removeCards(cards, cardsUsed);
        if (this.canFormSets(remaining, jokerCount - jokersNeeded)) return true;
      }
    }

    return false;
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

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildCards() {
  const cards = [];
  for (let s = 0; s < SUITS.length; s++) {
    for (let r = 0; r < RANKS.length; r++) {
      cards.push({ suit: SUITS[s], rank: RANKS[r] });
    }
  }
  return cards;
}

function shuffleInPlace(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = cards[i];
    cards[i] = cards[j];
    cards[j] = t;
  }
}

class Deck {
  constructor() {
    this.cards = buildCards();
    shuffleInPlace(this.cards);
  }

  remaining() {
    return this.cards.length;
  }

  draw() {
    if (this.cards.length === 0) {
      throw new Error('Deck is empty');
    }
    return this.cards.pop();
  }
}

module.exports = {
  Deck,
  SUITS,
  RANKS,
};

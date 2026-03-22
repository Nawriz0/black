function rankPoints(rank) {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K' || rank === '10') return 10;
  return parseInt(rank, 10);
}

function handValue(hand) {
  let total = 0;
  let acesAsEleven = 0;
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    if (card.rank === 'A') {
      total += 11;
      acesAsEleven += 1;
    } else {
      total += rankPoints(card.rank);
    }
  }
  while (total > 21 && acesAsEleven > 0) {
    total -= 10;
    acesAsEleven -= 1;
  }
  const soft = acesAsEleven > 0 && total <= 21;
  return { total, soft };
}

function isNaturalBlackjack(hand) {
  if (!hand || hand.length !== 2) return false;
  return handValue(hand).total === 21;
}

function isBust(hand) {
  return handValue(hand).total > 21;
}

function dealerMustHit(hand) {
  return handValue(hand).total < 17;
}

function comparePlayerVsDealer(playerHand, dealerHand, playerBusted) {
  const pVal = handValue(playerHand).total;
  const dVal = handValue(dealerHand).total;
  const pBJ = isNaturalBlackjack(playerHand);
  const dBJ = isNaturalBlackjack(dealerHand);

  if (playerBusted) {
    return 'lose';
  }
  if (dBJ && pBJ) {
    return 'push';
  }
  if (dBJ && !pBJ) {
    return 'lose';
  }
  if (pBJ && !dBJ) {
    return 'blackjack';
  }
  if (!playerBusted && isBust(dealerHand)) {
    return 'win';
  }
  if (pVal > dVal) {
    return 'win';
  }
  if (pVal < dVal) {
    return 'lose';
  }
  return 'push';
}

module.exports = {
  handValue,
  isNaturalBlackjack,
  isBust,
  dealerMustHit,
  comparePlayerVsDealer,
};

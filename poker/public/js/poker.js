const Poker = {
    createDeck() {
        const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
        const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
        const deck = [];
        for (const suit of suits) {
            for (const rank of ranks) {
                deck.push({suit, rank, value: ranks.indexOf(rank) + 2});
            }
        }
        return this.shuffle(deck);
    },

    shuffle(deck) {
        const shuffled = [...deck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    evaluateHand(cards) {
        const sorted = [...cards].sort((a, b) => b.value - a.value);
        const values = sorted.map(c => c.value);
        const suits = sorted.map(c => c.suit);

        const suitCounts = {};
        suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
        const isFlush = Object.values(suitCounts).some(c => c >= 5);
        const flushSuit = isFlush ? Object.keys(suitCounts).find(s => suitCounts[s] >= 5) : null;

        const uniqueValues = [...new Set(values)];
        let isStraight = false;
        let straightHigh = 0;

        for (let i = 0; i <= uniqueValues.length - 5; i++) {
            if (uniqueValues[i] - uniqueValues[i + 4] === 4) {
                isStraight = true;
                straightHigh = uniqueValues[i];
            }
        }

        if (uniqueValues.includes(14) && uniqueValues.includes(2) && uniqueValues.includes(3) &&
            uniqueValues.includes(4) && uniqueValues.includes(5)) {
            isStraight = true;
            straightHigh = 5;
        }

        const valueCounts = {};
        values.forEach(v => valueCounts[v] = (valueCounts[v] || 0) + 1);
        const counts = Object.values(valueCounts).sort((a, b) => b - a);

        const flushCards = isFlush ? sorted.filter(c => c.suit === flushSuit) : [];

        if (isStraight && isFlush) {
            const sfCards = this.getStraightFlushCards(sorted, flushCards, straightHigh);
            return { rank: 8, name: 'Straight Flush', cards: sfCards };
        }

        if (counts[0] === 4) {
            const quadValue = parseInt(Object.keys(valueCounts).find(v => valueCounts[v] === 4));
            const kicker = sorted.find(c => c.value !== quadValue);
            const quadCards = sorted.filter(c => c.value === quadValue).slice(0, 4);
            return { rank: 7, name: 'Four of a Kind', cards: [...quadCards, kicker] };
        }

        if (counts[0] === 3 && counts[1] >= 2) {
            const tripValue = parseInt(Object.keys(valueCounts).find(v => valueCounts[v] === 3));
            const pairValue = parseInt(Object.keys(valueCounts).find(v => valueCounts[v] >= 2 && parseInt(v) !== tripValue));
            const trips = sorted.filter(c => c.value === tripValue).slice(0, 3);
            const pairs = sorted.filter(c => c.value === pairValue).slice(0, 2);
            return { rank: 6, name: 'Full House', cards: [...trips, ...pairs] };
        }

        if (isFlush) {
            return { rank: 5, name: 'Flush', cards: flushCards.slice(0, 5) };
        }

        if (isStraight) {
            const straightCards = this.getStraightCards(sorted, straightHigh);
            return { rank: 4, name: 'Straight', cards: straightCards };
        }

        if (counts[0] === 3) {
            const tripValue = parseInt(Object.keys(valueCounts).find(v => valueCounts[v] === 3));
            const trips = sorted.filter(c => c.value === tripValue).slice(0, 3);
            const kickers = sorted.filter(c => c.value !== tripValue).slice(0, 2);
            return { rank: 3, name: 'Three of a Kind', cards: [...trips, ...kickers] };
        }

        if (counts[0] === 2 && counts[1] === 2) {
            const pairValues = Object.keys(valueCounts).filter(v => valueCounts[v] === 2)
                .map(v => parseInt(v)).sort((a, b) => b - a);
            const pairs1 = sorted.filter(c => c.value === pairValues[0]).slice(0, 2);
            const pairs2 = sorted.filter(c => c.value === pairValues[1]).slice(0, 2);
            const kicker = sorted.find(c => c.value !== pairValues[0] && c.value !== pairValues[1]);
            return { rank: 2, name: 'Two Pair', cards: [...pairs1, ...pairs2, kicker] };
        }

        if (counts[0] === 2) {
            const pairValue = parseInt(Object.keys(valueCounts).find(v => valueCounts[v] === 2));
            const pairs = sorted.filter(c => c.value === pairValue).slice(0, 2);
            const kickers = sorted.filter(c => c.value !== pairValue).slice(0, 3);
            return { rank: 1, name: 'Pair', cards: [...pairs, ...kickers] };
        }

        return { rank: 0, name: 'High Card', cards: sorted.slice(0, 5) };
    },

    evaluateHoldem(holeCards, communityCards) {
        // HandForge Pro: карманных карт может быть 0-2 (часть могла сгореть),
        // лучшая комбинация — любые 5 карт из руки+борда (обычный холдем),
        // а не строго "2 из руки", как в evaluateOmaha.
        const all = [...holeCards, ...communityCards];
        if (all.length < 5) return null;

        const combos = this.kCombinations(all, 5);
        let best = null;
        for (const combo of combos) {
            const result = this.evaluateHand(combo);
            if (!best || this.compareHands(result, best) > 0) {
                best = result;
                best.cards = combo;
            }
        }
        return best;
    },

    kCombinations(arr, k) {
        const results = [];
        const combo = [];
        function helper(start) {
            if (combo.length === k) {
                results.push(combo.slice());
                return;
            }
            for (let i = start; i < arr.length; i++) {
                combo.push(arr[i]);
                helper(i + 1);
                combo.pop();
            }
        }
        helper(0);
        return results;
    },

    evaluateOmaha(holeCards, communityCards) {
        let bestResult = null;

        for (let i = 0; i < holeCards.length; i++) {
            for (let j = i + 1; j < holeCards.length; j++) {
                for (let a = 0; a < communityCards.length; a++) {
                    for (let b = a + 1; b < communityCards.length; b++) {
                        for (let c = b + 1; c < communityCards.length; c++) {
                            const hand = [
                                holeCards[i], holeCards[j],
                                communityCards[a], communityCards[b], communityCards[c]
                            ];
                            const result = this.evaluateHand(hand);

                            if (!bestResult || this.compareHands(result, bestResult) > 0) {
                                bestResult = result;
                            }
                        }
                    }
                }
            }
        }

        return bestResult;
    },

    getStraightFlushCards(sorted, flushCards, straightHigh) {
        const fc = [...flushCards].sort((a, b) => b.value - a.value);
        if (straightHigh === 5 && fc.some(c => c.value === 14)) {
            return [
                fc.find(c => c.value === 14),
                ...fc.filter(c => c.value >= 2 && c.value <= 5).sort((a, b) => b.value - a.value)
            ].filter(Boolean);
        }
        return fc.filter(c => c.value <= straightHigh && c.value > straightHigh - 5);
    },

    getStraightCards(sorted, straightHigh) {
        const used = new Set();
        const result = [];

        if (straightHigh === 5) {
            const ace = sorted.find(c => c.value === 14);
            if (ace) result.push(ace);
            for (let v = 5; v >= 2; v--) {
                const card = sorted.find(c => c.value === v && !used.has(c));
                if (card) {
                    result.push(card);
                    used.add(card);
                }
            }
        } else {
            for (let v = straightHigh; v > straightHigh - 5; v--) {
                const card = sorted.find(c => c.value === v && !used.has(c));
                if (card) {
                    result.push(card);
                    used.add(card);
                }
            }
        }
        return result;
    },

    compareHands(hand1, hand2) {
        if (hand1.rank !== hand2.rank) {
            return hand1.rank - hand2.rank;
        }

        for (let i = 0; i < Math.min(hand1.cards.length, hand2.cards.length); i++) {
            if (hand1.cards[i].value !== hand2.cards[i].value) {
                return hand1.cards[i].value - hand2.cards[i].value;
            }
        }

        return 0;
    },

    getHandName(rank) {
        const names = [
            'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
            'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
        ];
        return names[rank] || 'Unknown';
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Poker;
}

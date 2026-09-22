const upperChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const lowerChars = 'abcdefghijkmnpqrstuvwxyz';
const digitChars = '23456789';
const accountChars = upperChars + lowerChars + digitChars;

function randomIndex(length) {
	const limit = Math.floor(256 / length) * length;
	const bytes = new Uint8Array(1);
	do {
		crypto.getRandomValues(bytes);
	} while (bytes[0] >= limit);
	return bytes[0] % length;
}

function randomChar(chars) {
	return chars[randomIndex(chars.length)];
}

function shuffle(chars) {
	for (let i = chars.length - 1; i > 0; i--) {
		const j = randomIndex(i + 1);
		[chars[i], chars[j]] = [chars[j], chars[i]];
	}
	return chars.join('');
}

export function genEmailName() {
	return Array.from({ length: 6 }, () => randomChar(accountChars)).join('');
}

export function genPassword() {
	const chars = [randomChar(upperChars), randomChar(lowerChars), randomChar(digitChars)];
	while (chars.length < 8) chars.push(randomChar(accountChars));
	return shuffle(chars);
}

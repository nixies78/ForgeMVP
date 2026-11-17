/**
 * Tests for the randomiser logic (public/concepts/randomiser-1-slots/randomiser.js), run against
 * the real reel data in public/data/randomiser.json.
 *
 * Run:  node tests/randomiser.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  REEL_KEYS,
  slugify,
  article,
  buildReels,
  flavourPhrase,
  strapline,
  typeLine,
  underneathLine,
  hookLine,
  pickDifferent,
  encodeHash,
  decodeHash
} from '../public/concepts/randomiser-1-slots/randomiser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(root, 'public/data/randomiser.json'), 'utf8'));
const reels = buildReels(data);
const find = (key, name) => reels[key].find(e => e.name === name);

test('slugify follows the documented rule', () => {
  assert.equal(slugify('K-Pop Demon Hunters'), 'k-pop-demon-hunters');
  assert.equal(slugify("Gentle — you can't really lose"), 'gentle-you-can-t-really-lose');
  assert.equal(slugify('Chaotic — nobody\'s in control'), 'chaotic-nobody-s-in-control');
  assert.equal(slugify('  Sci-fi future!  '), 'sci-fi-future');
  assert.equal(slugify('LEGO'), 'lego');
  assert.equal(slugify('Café'), 'cafe');
});

test('every slug is unique within its reel', () => {
  for (const key of REEL_KEYS) {
    const slugs = reels[key].map(e => e.slug);
    assert.equal(new Set(slugs).size, slugs.length, `duplicate slug on reel ${key}`);
    assert.ok(slugs.every(Boolean), `empty slug on reel ${key}`);
  }
});

test('reels: flavour reel holds the flavours then the brands', () => {
  assert.equal(reels.f.length, data.flavours.length + data.brands_on_flavour_reel.length);
  assert.equal(reels.t.length, data.game_types.length);
  assert.equal(reels.h.length, data.hooks.length);
  assert.equal(find('f', 'Vampires').image, '/concepts/_media/randomiser/flavours/vampires.webp');
  assert.equal(find('f', 'LEGO').image, '/concepts/_media/randomiser/brands/lego.webp');
  assert.equal(find('t', 'Box Fight').image, '/concepts/_media/randomiser/game-types/box-fight.webp');
  assert.equal(find('h', 'Weird, played straight').image, '/concepts/_media/randomiser/hooks/weird-played-straight.webp');
});

test('article is right for every game type', () => {
  const expected = {
    'Box Fight': 'A', 'Zone Wars': 'A', 'Red vs Blue': 'A', 'Gun Game': 'A', 'Deathrun': 'A',
    'Parkour Obby': 'A', 'Racing': 'A', 'Prop Hunt': 'A', 'Hide and Seek': 'A', 'Infection': 'An',
    'Murder Mystery': 'A', 'Escape Room': 'An', 'Horror Map': 'A', 'Tycoon': 'A', 'Simulator': 'A',
    'Tower Defence': 'A', 'Horde Survival': 'A', 'Boss Fight': 'A', 'Capture the Flag': 'A',
    'Sports Game': 'A', 'Metroidvania': 'A', 'Open World Adventure': 'An', 'Heist': 'A', 'Social Hub': 'A'
  };
  assert.deepEqual(Object.keys(expected).sort(), data.game_types.map(t => t.name).sort(),
    'expected table must cover exactly the game types in the data');
  for (const t of data.game_types) assert.equal(article(t.name), expected[t.name], t.name);
});

test('article handles sound, not spelling', () => {
  assert.equal(article('Hour of Doom'), 'An');
  assert.equal(article('Unicorn Race'), 'A');
  assert.equal(article('One-Shot Arena'), 'A');
  assert.equal(article('Euro Kart'), 'A');
  assert.equal(article('FPS Arena'), 'An');
  assert.equal(article('RPG'), 'An');
  assert.equal(article('PvP Arena'), 'A');
  assert.equal(article('Umbrella Fight'), 'An');
});

test('brands use "set in the world of", flavours use their phrase', () => {
  assert.equal(flavourPhrase(find('f', 'The Walking Dead')), 'set in the world of The Walking Dead');
  assert.equal(flavourPhrase(find('f', 'Vampires')), 'full of vampires');
  assert.equal(
    strapline(find('f', 'The Walking Dead'), find('t', 'Hide and Seek'), find('h', 'Weird, played straight')),
    'A Hide and Seek, set in the world of The Walking Dead. Weird, played straight.'
  );
  assert.equal(
    strapline(find('f', 'Vampires'), find('t', 'Tycoon'), find('h', 'Dry and deadpan')),
    'A Tycoon, full of vampires. Dry and deadpan.'
  );
  assert.equal(
    strapline(find('f', 'LEGO'), find('t', 'Escape Room'), find('h', 'Grand and serious')),
    'An Escape Room, set in the world of LEGO. Grand and serious.'
  );
});

test('no strapline or detail line ever has a double full stop', () => {
  for (const f of reels.f) for (const t of reels.t) for (const h of reels.h) {
    const s = strapline(f, t, h);
    assert.ok(!/\.\s*\./.test(s), s);
    assert.ok(s.endsWith('.'), s);
  }
  for (const t of reels.t) assert.ok(!/\.\s*\./.test(typeLine(t)), typeLine(t));
  for (const h of reels.h) assert.ok(!/\.\s*\./.test(hookLine(h)), hookLine(h));
  // Even if the data itself carries the full stops.
  assert.equal(
    strapline({ kind: 'flavour', name: 'X', phrase: 'full of x.' }, { name: 'Heist' }, { name: 'Loud.' }),
    'A Heist, full of x. Loud.'
  );
  assert.equal(strapline({ kind: 'flavour', phrase: 'set at sea' }, { name: 'Heist' }, { name: 'Why not?' }),
    'A Heist, set at sea. Why not?');
});

test('detail lines', () => {
  assert.equal(typeLine(find('t', 'Hide and Seek')), 'Hide and Seek - A big space, somewhere to hide, and someone counting.');
  assert.equal(
    underneathLine(find('t', 'Hide and Seek')),
    'Underneath, that means: Hiding · A few against many · 10–20 · Rooms and corridors · 5–15 minutes'
  );
  assert.equal(hookLine(find('h', 'Weird, played straight')), "Weird, played straight - One rule that shouldn't work, treated as normal.");
});

test('empty count is skipped', () => {
  const line = underneathLine(find('t', 'Tycoon'));
  assert.equal(line, 'Underneath, that means: Building · On your own · A hub with branches · Longer than that');
  assert.ok(!line.includes('·  ·'));
  assert.equal(underneathLine({ name: 'Bare' }), '');
});

test('pickDifferent never repeats the current entry', () => {
  for (const length of [2, 3, 7, 31]) {
    for (let current = 0; current < length; current++) {
      // Edge values of the random source, then a sweep.
      for (const r of [0, 0.999999, ...Array.from({ length: 50 }, (_, i) => i / 50)]) {
        const next = pickDifferent(length, current, () => r);
        assert.notEqual(next, current);
        assert.ok(next >= 0 && next < length);
      }
    }
  }
  for (let i = 0; i < 2000; i++) {
    const current = i % 31;
    assert.notEqual(pickDifferent(31, current), current);
  }
});

test('pickDifferent covers every other entry and handles edge cases', () => {
  const seen = new Set();
  for (let i = 0; i < 6; i++) seen.add(pickDifferent(7, 3, () => i / 6));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 4, 5, 6]);
  assert.equal(pickDifferent(1, 0), 0);
  assert.equal(pickDifferent(0, null), -1);
  const first = pickDifferent(5, null, () => 0.999999);
  assert.equal(first, 4);
});

test('hash round-trips', () => {
  const state = {
    f: reels.f.findIndex(e => e.name === 'K-Pop Demon Hunters'),
    t: reels.t.findIndex(e => e.name === 'Tycoon'),
    h: reels.h.findIndex(e => e.name === "Gentle — you can't really lose"),
    locked: { f: true, t: false, h: true }
  };
  const hash = encodeHash(state, reels);
  assert.equal(hash, '#f=k-pop-demon-hunters&t=tycoon&h=gentle-you-can-t-really-lose&lock=f,h');
  assert.deepEqual(decodeHash(hash, reels), state);
  for (let i = 0; i < reels.f.length; i++) {
    const s = { f: i, t: i % reels.t.length, h: i % reels.h.length, locked: { f: false, t: true, h: false } };
    assert.deepEqual(decodeHash(encodeHash(s, reels), reels), s);
  }
  assert.equal(encodeHash({ f: null, t: null, h: null, locked: {} }, reels), '');
});

test('unknown or junk hash values are ignored safely', () => {
  const empty = { f: null, t: null, h: null, locked: { f: false, t: false, h: false } };
  assert.deepEqual(decodeHash('', reels), empty);
  assert.deepEqual(decodeHash(undefined, reels), empty);
  assert.deepEqual(decodeHash('#f=werewolves&t=&h=%E0%A4%A&lock=f,t,h,z', reels), empty);
  assert.deepEqual(decodeHash('#nonsense', reels), empty);
  const partial = decodeHash('#f=vampires&t=not-a-type&h=dry-and-deadpan&lock=t,h&x=1', reels);
  assert.equal(reels.f[partial.f].name, 'Vampires');
  assert.equal(partial.t, null);
  assert.equal(reels.h[partial.h].name, 'Dry and deadpan');
  assert.deepEqual(partial.locked, { f: false, t: false, h: true }, 'lock on an empty reel is dropped');
  // Case and spacing are forgiven because values are re-slugified.
  assert.equal(reels.t[decodeHash('#t=Box%20Fight', reels).t].name, 'Box Fight');
});

// Ambient townsfolk (design study, not in the game yet): a seed makes a design (body, skin, hair, and a cloth item
// in each of the head, torso, legs and feet slots, each in a dyed tint), and the design is built on the hero's rig:
// the same blocky boxes and the same joints (hip, knee, ankle, shoulder, elbow, wrist, waist, neck), in a masculine
// or a feminine build. The same seed always gives the same person, so a design worth keeping is just its number.
//
//   const F = makeFolkKit(GFX);
//   const d = F.design(1234);          // plain data: what they wear and in what colours
//   const f = F.build(d);              // { g, body, chest, head, legL, legR, knees, ankles, armL, armR, elbows, wrists, ... }
//   F.pose(f, 'walk', t);              // idle, walk, talk, wave, carry, sweep
//
// (v7) Each person has a job (JOBS: hamlet, medium and large town trades) that picks their clothes, dyes, extras and
// the tool in their hand, and a name (makeName).
//
// Sizes are the hero's (makeHuman, unscaled, feet on y 0, facing +z), so a townsperson stands as tall as the hero.

// ---------- seeded randomness ----------
export function folkRand(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a weighted pick from [[value, weight], ...]
const pick = (r, list) => {
  let s = 0; for (const [, w] of list) s += w;
  let u = r() * s;
  for (const [v, w] of list) { u -= w; if (u < 0) return v; }
  return list[list.length - 1][0];
};

// ---------- colours ----------
export const SKIN = ['#f4d4b4', '#ecc49c', '#e0b48a', '#d0a07a', '#b8865e', '#9a6a46', '#7a5034', '#5a3824'];
export const HAIR = { black: '#1c1612', darkBrown: '#36231a', brown: '#5e3a22', chestnut: '#7a4424', auburn: '#94421e', ginger: '#c06a2e',
  blonde: '#d6b066', flaxen: '#e6d6a6', grey: '#8e8c88', white: '#dedcd6' };
// The dyes a town could make: undyed cloth, earth browns, madder reds, weld yellows, woad blues, and a few rarer ones.
// (weights: how often a garment comes out that colour)
export const DYES = {
  linen: ['#dcd0b4', 6], wool: ['#b6a888', 5], oat: ['#c8b48c', 4], brown: ['#6a4a32', 6], umber: ['#4e3826', 4],
  russet: ['#8a3e26', 4], madder: ['#a8302a', 3], rose: ['#c06e66', 2], ochre: ['#c0923a', 3], weld: ['#d0b44c', 2],
  moss: ['#5e6a34', 4], green: ['#3a6438', 3], teal: ['#2e6464', 2], woad: ['#3f6a8a', 4], navy: ['#2a3a5a', 3],
  grey: ['#6c6a66', 4], charcoal: ['#383634', 3], plum: ['#5a3050', 1], lilac: ['#8a7098', 1],
};
const LEATHER = ['#3a2a1e', '#4e3220', '#5e3e26', '#6e4426', '#2c241e'];
const STRAW = '#d8bc72', STRAW_DARK = '#a88a48';
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const rgbHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
// lighter (k > 0) or darker (k < 0)
export const shade = (h, k) => rgbHex(hexRgb(h).map(v => k >= 0 ? v + (1 - v) * k : v * (1 + k)));
// the same dye never comes out quite the same twice: a little lighter or darker, a little warmer or cooler
const jitter = (r, h, amt = 0.07) => {
  const l = (r() * 2 - 1) * amt, w = (r() * 2 - 1) * amt * 0.5, c = hexRgb(h);
  return rgbHex([c[0] * (1 + l + w), c[1] * (1 + l), c[2] * (1 + l - w)]);
};
const dyeList = Object.entries(DYES).map(([k, [, w]]) => [k, w]);
const dye = (r, avoid = []) => { let k; for (let n = 0; n < 8; n++) { k = pick(r, dyeList); if (!avoid.includes(k)) break; } return k; };

// ---------- jobs ----------
// (v7, Jordan) Every townsperson has a job from the hamlet, medium town and large town lists, and dresses for it: each
// job says what it wears in each slot ([item, weight]), which dyes each part comes in, how likely each extra is, and
// the tool in hand. Items for one build only are swapped for the other build's nearest (SWAP), so any job suits
// either. Whole-body items (dress, gown, robe, surplice) fill the legs with their own skirt.
export const DYES_EXTRA = { white: '#e8e2d4', scarlet: '#b8282a', gold: '#c8a048', black: '#262422', forest: '#2e4a2a', crimson: '#7a1a24' };
for (const [k, c] of Object.entries(DYES_EXTRA)) DYES[k] = [c, 0];
const WHOLE = ['dress', 'gown', 'robe', 'surplice'];
const SWAP = {
  fem: { vest: 'bodice', doublet: 'gown' },
  masc: { blouse: 'shirt', bodice: 'vest', dress: 'tunic', gown: 'doublet', skirt: 'trousers', longSkirt: 'trousers', coif: 'cap', kerchief: 'cap' },
};
const PLAIN = ['linen', 'wool', 'oat', 'brown', 'umber', 'grey'], EARTH = ['brown', 'umber', 'russet', 'moss', 'oat', 'wool'];
const RICH = ['plum', 'madder', 'navy', 'teal', 'forest', 'crimson', 'lilac'];
const FEET = [['boots', 3], ['shoes', 3], ['wraps', 1]];
const CASUAL_LEGS = [['trousers', 4], ['breeches', 3], ['skirt', 3], ['longSkirt', 4]];
const j = (title, tier, o) => Object.assign({ title, tier, feet: FEET, legs: CASUAL_LEGS, x: {}, surnames: [] }, o);
export const JOBS = {
  // the hamlet
  elder: j('Hamlet Elder', 'hamlet', { ages: [['old', 1]], head: [['none', 4], ['hood', 2], ['cap', 1], ['coif', 1]], torso: [['robe', 4], ['tunic', 2], ['dress', 2]],
    dye: { torso: ['wool', 'oat', 'brown', 'grey', 'moss', 'umber'], legs: PLAIN, head: EARTH }, x: { belt: 0.8, shawl: 0.4 }, prop: 'staff', surnames: ['Elder', 'Oldham'] }),
  smith: j('Village Smith', 'hamlet', { head: [['none', 5], ['cap', 2], ['kerchief', 1]], torso: [['shortSleeve', 3], ['shirt', 2]], legs: [['trousers', 3], ['breeches', 1], ['longSkirt', 1]], feet: [['boots', 1]],
    dye: { torso: ['linen', 'wool', 'grey', 'charcoal'], legs: ['brown', 'umber', 'charcoal'], head: ['charcoal', 'brown'] }, x: { leatherApron: 1, gloves: 0.6, belt: 0.3 }, prop: 'hammer', surnames: ['Smith', 'Hammond', 'Ferrer'] }),
  tanner: j('Tanner', 'hamlet', { head: [['none', 4], ['kerchief', 2], ['cap', 1]], torso: [['shortSleeve', 3], ['shirt', 2], ['bodice', 1]], legs: [['breeches', 2], ['trousers', 2], ['skirt', 1]],
    dye: { torso: ['oat', 'wool', 'russet', 'brown'], legs: ['brown', 'umber'], head: EARTH }, x: { leatherApron: 0.8, gloves: 0.3 }, prop: 'scraper', surnames: ['Tanner', 'Barker', 'Hyde'] }),
  woodcutter: j('Woodcutter', 'hamlet', { head: [['none', 3], ['hood', 2], ['cap', 2]], torso: [['tunic', 3], ['shirt', 2], ['vest', 2]], legs: [['trousers', 3], ['breeches', 2], ['skirt', 1]], feet: [['boots', 3], ['wraps', 1]],
    dye: { torso: ['moss', 'green', 'forest', 'russet', 'madder', 'brown'], legs: ['brown', 'umber', 'moss'], head: ['forest', 'russet', 'brown'] }, x: { belt: 0.9 }, prop: 'axe', surnames: ['Woodward', 'Hewer', 'Forester'] }),
  goodfolk: j('Goodman', 'hamlet', { femTitle: 'Goodwife', head: [['none', 3], ['coif', 3], ['kerchief', 2], ['cap', 1]], torso: [['blouse', 3], ['bodice', 3], ['dress', 2], ['shirt', 3]],
    dye: { torso: ['linen', 'oat', 'rose', 'woad', 'weld', 'moss'], legs: EARTH, head: ['white', 'linen', 'oat'] }, x: { apron: 0.95, apronBib: 0.6, shawl: 0.25 }, prop: 'breadBasket', surnames: ['Baker', 'Cook', 'Miller'] }),
  lamplighter: j('Lamplighter', 'hamlet', { head: [['cap', 3], ['hood', 2], ['none', 1]], torso: [['tunic', 3], ['shirt', 2], ['vest', 1], ['bodice', 1]],
    dye: { torso: ['navy', 'charcoal', 'grey', 'woad'], legs: ['charcoal', 'grey', 'umber'], head: ['charcoal', 'navy', 'grey'] }, x: { belt: 0.8, cloak: 0.3 }, prop: 'lampPole', surnames: ['Lightfoot', 'Candler', 'Wick'] }),
  // the medium town
  ironmonger: j('Ironmonger', 'medium', { head: [['none', 3], ['cap', 2]], torso: [['vest', 3], ['shirt', 2], ['bodice', 1]], legs: [['trousers', 3], ['breeches', 2], ['longSkirt', 2]],
    dye: { torso: ['grey', 'charcoal', 'umber', 'navy'], under: ['linen', 'wool'], legs: ['charcoal', 'umber', 'brown'], head: ['charcoal', 'grey'] }, x: { leatherApron: 0.5, belt: 0.6 }, prop: 'ingot', surnames: ['Ironside', 'Ferrer', 'Stahl'] }),
  armorer: j('Armorer', 'medium', { head: [['none', 4], ['kerchief', 1]], torso: [['shirt', 3], ['shortSleeve', 2]], legs: [['trousers', 3], ['breeches', 1]], feet: [['boots', 1]],
    dye: { torso: ['linen', 'grey', 'wool'], legs: ['charcoal', 'brown'], head: ['charcoal'] }, x: { leatherApron: 1, gloves: 0.9 }, prop: 'hammer', surnames: ['Armstrong', 'Mailer', 'Platt'] }),
  glazier: j('Glazier', 'medium', { head: [['cap', 2], ['none', 2], ['kerchief', 1]], torso: [['shirt', 3], ['vest', 2], ['blouse', 1]],
    dye: { torso: ['linen', 'teal', 'woad', 'oat'], under: ['linen'], legs: ['grey', 'brown', 'navy'], head: ['teal', 'grey'], apron: ['oat', 'grey'] }, x: { apron: 0.8, gloves: 0.5 }, prop: 'pane', surnames: ['Glazier', 'Glass', 'Pane'] }),
  mason: j('Stonemason', 'medium', { head: [['cap', 3], ['kerchief', 2], ['none', 1]], torso: [['tunic', 3], ['shortSleeve', 2]], legs: [['trousers', 3], ['breeches', 2], ['skirt', 1]], feet: [['boots', 1]],
    dye: { torso: ['linen', 'wool', 'grey', 'oat'], legs: ['grey', 'brown', 'wool'], head: ['grey', 'linen'], apron: ['grey', 'wool'] }, x: { apron: 0.6, belt: 0.7 }, prop: 'mallet', surnames: ['Mason', 'Stone', 'Quarrier'] }),
  herbalist: j('Herbalist', 'medium', { head: [['hood', 3], ['kerchief', 2], ['none', 2]], torso: [['robe', 2], ['dress', 3], ['tunic', 2]],
    dye: { torso: ['moss', 'green', 'teal', 'oat', 'forest'], legs: ['moss', 'brown', 'oat'], head: ['moss', 'forest', 'oat'] }, x: { satchel: 1, belt: 0.6 }, prop: 'herbBasket', surnames: ['Greenleaf', 'Herbert', 'Sage'] }),
  innkeeper: j('Innkeeper', 'medium', { head: [['none', 4], ['coif', 2], ['kerchief', 1]], torso: [['shirt', 3], ['vest', 3], ['bodice', 3], ['blouse', 1]],
    dye: { torso: ['madder', 'russet', 'brown', 'ochre', 'moss'], under: ['linen', 'white'], legs: ['brown', 'umber', 'charcoal'], head: ['white', 'linen'], apron: ['white', 'linen'] }, x: { apron: 1, apronBib: 0.3 }, prop: 'mug', surnames: ['Brewer', 'Ale', 'Tapster'] }),
  guard: j('Town Guard', 'medium', { head: [['kettleHat', 4], ['hood', 1], ['none', 1]], torso: [['tabard', 1]], legs: [['trousers', 4], ['breeches', 1]], feet: [['boots', 1]],
    dye: { torso: ['woad', 'madder', 'scarlet', 'navy'], under: ['grey', 'wool', 'charcoal'], trim: ['weld', 'gold', 'white'], legs: ['charcoal', 'grey', 'brown'], head: ['grey'] }, x: { belt: 1, gloves: 0.7 }, prop: 'spear', surnames: ['Warder', 'Ward', 'Watts'] }),
  carter: j('Carter', 'medium', { head: [['strawHat', 3], ['cap', 2], ['hood', 1]], torso: [['tunic', 3], ['vest', 2], ['bodice', 1]], feet: [['boots', 1]],
    dye: { torso: ['brown', 'russet', 'ochre', 'moss'], under: ['linen', 'oat'], legs: ['brown', 'umber'], head: ['brown', 'russet'] }, x: { belt: 0.9, neckerchief: 0.5 }, prop: 'whip', surnames: ['Carter', 'Wainwright', 'Waggoner'] }),
  sweeper: j('Street Sweeper', 'medium', { head: [['kerchief', 2], ['cap', 2], ['none', 1]], torso: [['shirt', 2], ['tunic', 2], ['blouse', 1]], feet: [['wraps', 2], ['shoes', 1]],
    dye: { torso: ['oat', 'grey', 'brown', 'wool'], legs: ['grey', 'brown', 'umber'], head: ['grey', 'oat', 'brown'], apron: ['grey', 'brown'] }, x: { apron: 0.4 }, prop: 'broomHeld', surnames: ['Sweep', 'Dustin', 'Ashby'] }),
  // the large town
  masterSmith: j('Master Smith', 'large', { ages: [['adult', 3], ['old', 2]], head: [['none', 4], ['cap', 1]], torso: [['vest', 3], ['shirt', 2], ['bodice', 1]], legs: [['trousers', 3], ['breeches', 1]], feet: [['boots', 1]],
    dye: { torso: ['charcoal', 'black', 'umber'], under: ['linen', 'grey'], legs: ['charcoal', 'black'], head: ['charcoal'] }, x: { leatherApron: 1, gloves: 1 }, prop: 'hammer', surnames: ['Smith', 'Anvilmond', 'Forgeworth'] }),
  jeweller: j('Jeweller', 'large', { head: [['beret', 3], ['featherCap', 2], ['none', 2]], torso: [['doublet', 3], ['gown', 3]], legs: [['trousers', 2], ['breeches', 3]], feet: [['shoes', 1]],
    dye: { torso: RICH, trim: ['gold', 'weld', 'white'], legs: ['black', 'navy', 'charcoal', 'plum'], head: RICH }, x: { chain: 0.8 }, prop: 'purse', surnames: ['Goldwin', 'Gemmel', 'Assay'] }),
  merchant: j('Merchant Prince', 'large', { ages: [['adult', 3], ['old', 1]], head: [['tallHat', 3], ['featherCap', 3], ['beret', 1]], torso: [['doublet', 3], ['gown', 3]], legs: [['breeches', 2], ['trousers', 1]], feet: [['shoes', 2], ['boots', 1]],
    dye: { torso: ['plum', 'madder', 'crimson', 'navy', 'lilac'], trim: ['gold'], legs: ['black', 'navy', 'crimson'], head: ['black', 'plum', 'crimson'], cloak: ['crimson', 'plum', 'navy', 'forest'] }, x: { chain: 1, cloak: 0.7 }, prop: 'purse', surnames: ['Goldsby', 'Chapman', 'Marchand'] }),
  banker: j('Banker', 'large', { ages: [['adult', 2], ['old', 2]], head: [['tallHat', 4], ['beret', 1], ['none', 1]], torso: [['doublet', 3], ['gown', 3]], legs: [['trousers', 2], ['breeches', 2]], feet: [['shoes', 1]],
    dye: { torso: ['charcoal', 'navy', 'black', 'grey'], trim: ['gold', 'white'], legs: ['black', 'charcoal'], head: ['black', 'charcoal'] }, x: { chain: 0.8 }, prop: 'ledger', surnames: ['Lombard', 'Coyner', 'Mint'] }),
  cartographer: j('Cartographer', 'large', { head: [['beret', 3], ['hood', 1], ['none', 2]], torso: [['tunic', 2], ['doublet', 2], ['gown', 1], ['dress', 1]], legs: [['breeches', 2], ['trousers', 2], ['longSkirt', 1]],
    dye: { torso: ['teal', 'oat', 'brown', 'ochre', 'navy'], trim: ['oat', 'brown', 'gold'], legs: ['brown', 'charcoal', 'navy'], head: ['teal', 'brown', 'navy'] }, x: { satchel: 1, belt: 0.6 }, prop: 'scroll', surnames: ['Mapple', 'Wayland', 'Farrow'] }),
  bishop: j('Bishop', 'large', { ages: [['old', 3], ['adult', 1]], head: [['mitre', 1]], torso: [['robe', 1]], feet: [['shoes', 1]],
    dye: { torso: ['white'], trim: ['gold'], head: ['white'], cloak: ['crimson', 'scarlet', 'plum', 'gold'], stole: ['gold', 'crimson'] }, x: { cloak: 1, stole: 1, chain: 0.5 }, prop: 'crozier' }),
  priest: j('Cathedral Priest', 'large', { head: [['skullcap', 2], ['none', 3]], torso: [['robe', 1]], feet: [['shoes', 1]],
    dye: { torso: ['black', 'charcoal', 'umber', 'plum'], head: ['black', 'plum'], stole: ['white', 'gold', 'crimson', 'forest'] }, x: { stole: 1, belt: 0.6 }, prop: 'book' }),
  choir: j('Choir Singer', 'large', { ages: [['young', 3], ['adult', 2]], head: [['none', 1]], torso: [['surplice', 1]], feet: [['shoes', 1]],
    dye: { torso: ['crimson', 'scarlet', 'navy', 'black'], under: ['white'] }, prop: 'book' }),
  busker: j('Fountain Busker', 'large', { ages: [['young', 3], ['adult', 2]], head: [['featherCap', 4], ['none', 1], ['kerchief', 1]], torso: [['doublet', 2], ['tunic', 2], ['bodice', 2], ['vest', 1]], legs: [['breeches', 3], ['trousers', 1], ['skirt', 2]],
    dye: { torso: ['madder', 'weld', 'teal', 'rose', 'scarlet', 'lilac'], trim: ['weld', 'teal', 'madder', 'white'], under: ['linen', 'white'], legs: ['weld', 'teal', 'madder', 'navy'], head: ['scarlet', 'teal', 'weld'] }, x: { belt: 0.6, neckerchief: 0.3 }, prop: 'lute', surnames: ['Harper', 'Fiddler', 'Lark'] }),
  flowerSeller: j('Flower Seller', 'large', { ages: [['young', 3], ['adult', 2], ['old', 1]], head: [['strawHat', 3], ['kerchief', 3], ['none', 2]], torso: [['bodice', 3], ['blouse', 2], ['dress', 2], ['shirt', 2]], legs: [['skirt', 3], ['longSkirt', 2], ['trousers', 1]],
    dye: { torso: ['rose', 'lilac', 'weld', 'green', 'woad'], under: ['white', 'linen'], legs: ['green', 'moss', 'rose', 'oat'], head: ['rose', 'weld', 'green'], apron: ['white', 'linen'] }, x: { apron: 0.6, apronBib: 0.4, shawl: 0.2 }, prop: 'flowerBasket', surnames: ['Bloom', 'Rosewell', 'Thistlewood'] }),
  crier: j('Town Crier', 'large', { head: [['crierHat', 4], ['featherCap', 1]], torso: [['tabard', 2], ['doublet', 2], ['gown', 1]], legs: [['breeches', 3], ['trousers', 1]], feet: [['shoes', 1]],
    dye: { torso: ['scarlet', 'madder', 'woad', 'crimson'], under: ['white', 'linen'], trim: ['gold', 'weld'], legs: ['black', 'white', 'navy'], head: ['black', 'crimson'] }, x: { belt: 0.7 }, prop: 'bell', surnames: ['Crier', 'Belman', 'Herald'] }),
  captain: j('Captain of the Watch', 'large', { ages: [['adult', 3], ['old', 1]], head: [['kettleHat', 2], ['featherCap', 2], ['none', 1]], torso: [['tabard', 3], ['doublet', 1]], legs: [['trousers', 3], ['breeches', 1]], feet: [['boots', 1]],
    dye: { torso: ['navy', 'crimson', 'woad', 'black'], under: ['grey', 'charcoal'], trim: ['gold'], legs: ['black', 'charcoal'], head: ['grey', 'black'], cloak: ['navy', 'crimson', 'black'] }, x: { belt: 1, gloves: 1, cloak: 0.8, sword: 1 }, prop: 'none' }),
  gossip: j('Balcony Gossip', 'large', { ages: [['adult', 2], ['old', 3]], head: [['coif', 2], ['kerchief', 2], ['none', 2]], torso: [['bodice', 2], ['dress', 2], ['blouse', 1], ['vest', 1], ['shirt', 1]],
    dye: { torso: ['rose', 'lilac', 'weld', 'woad', 'ochre', 'plum'], under: ['white', 'linen'], legs: ['brown', 'plum', 'navy'], head: ['white', 'rose', 'lilac'] }, x: { shawl: 0.7, apron: 0.3 }, prop: 'none', surnames: ['Tattle', 'Whitby', 'Pryor'] }),
  pickpocket: j('Pickpocket', 'large', { ages: [['young', 4], ['adult', 1]], head: [['hood', 4], ['cap', 1]], torso: [['tunic', 2], ['shirt', 2], ['vest', 1], ['bodice', 1]], legs: [['trousers', 3], ['breeches', 1]], feet: [['wraps', 2], ['shoes', 1]],
    dye: { torso: ['charcoal', 'umber', 'grey', 'black'], under: ['grey', 'oat'], legs: ['charcoal', 'umber', 'black'], head: ['charcoal', 'black', 'umber'], cloak: ['charcoal', 'black'] }, x: { cloak: 0.5, belt: 0.5 }, prop: 'none', surnames: ['Fingers', 'Quickley', 'Nab'] }),
};
// (v9, Jordan) the hostile folk met on the road and in the wilds: their own list, never drawn for a town's people (a
// town's seeds stay as they were), made with design(seed, 'wilds'). Props can be a weighted list; extras add masks,
// furs, a quiver or a shield on the back, a cult sigil, war paint; a cult hood shadows the face, its eyes glowing.
const JOB_LIST = Object.keys(JOBS).map(k => [k, 1]);        // (the towns' jobs only: the wilds' are added after)
const ROUGH = ['brown', 'umber', 'charcoal', 'grey', 'moss', 'russet', 'wool', 'oat'];
Object.assign(DYES, { hide: ['#6e4a2e', 0], darkHide: ['#3e2c20', 0], bone: ['#d8ceb0', 0], ash: ['#8e8a82', 0] });
const wj = (title, tier, o) => j(title, tier, Object.assign({ hostile: true }, o));
export const WILDS = {
  footpad: wj('Footpad', 'road', { ages: [['young', 4], ['adult', 3]], head: [['hood', 3], ['cap', 2], ['none', 2]], torso: [['tunic', 3], ['shirt', 2], ['vest', 1], ['bodice', 1]], legs: [['trousers', 3], ['breeches', 1]], feet: [['wraps', 2], ['shoes', 1], ['boots', 1]],
    dye: { torso: ROUGH, under: ['oat', 'grey', 'linen'], legs: ROUGH, head: ['charcoal', 'umber', 'grey'], mask: ['charcoal', 'umber', 'madder', 'grey'] }, x: { belt: 0.7, mask: 0.5 }, prop: [['dagger', 3], ['club', 2]], surnames: ['Cutpurse', 'Nimble', 'Shank', 'Lightfinger'] }),
  bandit: wj('Bandit', 'road', { head: [['hood', 3], ['none', 2], ['cap', 1], ['slouchHat', 1]], torso: [['jerkin', 3], ['tunic', 2], ['gambeson', 2], ['vest', 1]], legs: [['trousers', 3], ['breeches', 1]], feet: [['boots', 3], ['wraps', 1]],
    dye: { torso: [...ROUGH, 'hide', 'darkHide'], under: ['oat', 'wool', 'grey', 'linen'], legs: ROUGH, head: ['charcoal', 'umber', 'moss', 'russet', 'madder'], mask: ['madder', 'charcoal', 'black', 'russet'] },
    x: { belt: 0.9, mask: 0.6, gloves: 0.3, quiver: 0.15 }, prop: [['club', 2], ['axe', 2], ['dagger', 2], ['swordDrawn', 1], ['spear', 1]], surnames: ['Blackhand', 'Crowe', 'Grimsby', 'Redcap'] }),
  banditChief: wj('Bandit Chief', 'road', { ages: [['adult', 3], ['old', 1]], head: [['slouchHat', 3], ['featherCap', 2], ['none', 2]], torso: [['jerkin', 2], ['doublet', 2], ['gambeson', 1]], legs: [['trousers', 2], ['breeches', 2]], feet: [['boots', 1]],
    dye: { torso: ['crimson', 'madder', 'darkHide', 'black', 'forest'], under: ['linen', 'white', 'grey'], trim: ['gold', 'weld'], legs: ['black', 'charcoal', 'umber'], head: ['black', 'crimson', 'umber'], cloak: ['crimson', 'black', 'forest', 'umber'] },
    x: { belt: 1, gloves: 0.8, cloak: 0.7, chain: 0.5, furs: 0.3 }, prop: [['swordDrawn', 1]], surnames: ['the Red', 'Ironjaw', 'Blackwood', 'Grimmond'] }),
  highwayman: wj('Highwayman', 'road', { femTitle: 'Highwaywoman', head: [['slouchHat', 4], ['featherCap', 1]], torso: [['doublet', 2], ['jerkin', 2], ['gambeson', 1]], legs: [['breeches', 2], ['trousers', 2]], feet: [['boots', 1]],
    dye: { torso: ['black', 'navy', 'crimson', 'darkHide', 'charcoal'], under: ['white', 'linen'], trim: ['gold', 'grey', 'white'], legs: ['black', 'charcoal', 'umber'], head: ['black', 'charcoal', 'navy'], cloak: ['black', 'charcoal', 'navy', 'crimson'], mask: ['black', 'charcoal', 'crimson'] },
    x: { mask: 1, cloak: 0.85, belt: 1, gloves: 0.9 }, prop: [['crossbow', 2], ['swordDrawn', 2]], surnames: ['Nightingale', 'Duskwell', 'Ravenshaw', 'Gallowby'] }),
  deserter: wj('Deserter', 'road', { head: [['kettleHat', 3], ['nasalHelm', 2], ['none', 1]], torso: [['tabard', 2], ['gambeson', 3]], legs: [['trousers', 4], ['breeches', 1]], feet: [['boots', 1]],
    dye: { torso: ['woad', 'madder', 'grey', 'wool', 'navy'], under: ['grey', 'wool', 'charcoal'], trim: ['wool', 'oat', 'grey'], legs: ['charcoal', 'grey', 'brown'], head: ['grey'], shield: ['woad', 'madder', 'grey'] },
    x: { belt: 1, gloves: 0.6, shield: 0.4 }, prop: [['spear', 2], ['swordDrawn', 2], ['axe', 1]], surnames: ['Turncoat', 'Oathless', 'Ward', 'Runwell'] }),
  poacher: wj('Poacher', 'wilds', { head: [['hood', 4], ['cap', 2], ['none', 1]], torso: [['jerkin', 3], ['tunic', 3], ['vest', 1], ['bodice', 1]], legs: [['trousers', 3], ['breeches', 2]], feet: [['boots', 2], ['wraps', 1]],
    dye: { torso: ['moss', 'green', 'forest', 'brown', 'hide'], under: ['oat', 'wool', 'moss'], legs: ['brown', 'umber', 'moss'], head: ['moss', 'forest', 'brown'] },
    x: { quiver: 1, belt: 0.9, satchel: 0.3, furs: 0.3 }, prop: [['shortbow', 3], ['axe', 1]], surnames: ['Fletcher', 'Snare', 'Huntley', 'Doe'] }),
  raider: wj('Raider', 'wilds', { head: [['nasalHelm', 3], ['none', 3], ['hood', 1]], torso: [['gambeson', 3], ['jerkin', 2], ['shortSleeve', 1]], legs: [['trousers', 4]], feet: [['boots', 2], ['wraps', 2]],
    dye: { torso: ['umber', 'grey', 'russet', 'darkHide', 'wool', 'madder'], under: ['wool', 'oat'], legs: ['umber', 'grey', 'brown', 'charcoal'], head: ['charcoal', 'umber'], shield: ['madder', 'woad', 'ochre', 'charcoal', 'bone'] },
    x: { furs: 0.8, shield: 0.6, belt: 1, warpaint: 0.6 }, prop: [['axe', 3], ['spear', 2], ['club', 1]], surnames: ['Grimbeard', 'Wolfsbane', 'Ashborn', 'Ravenson'] }),
  graveRobber: wj('Grave Robber', 'wilds', { head: [['hood', 3], ['cap', 2], ['kerchief', 1]], torso: [['tunic', 2], ['shirt', 2], ['vest', 1], ['bodice', 1]], legs: [['trousers', 3], ['breeches', 1]], feet: [['boots', 2], ['wraps', 1]],
    dye: { torso: ['grey', 'charcoal', 'umber', 'black', 'ash'], under: ['grey', 'oat'], legs: ['charcoal', 'umber', 'black'], head: ['charcoal', 'black', 'grey'], mask: ['grey', 'linen', 'charcoal'] },
    x: { mask: 0.5, gloves: 0.8, satchel: 0.6, belt: 0.7 }, prop: [['shovel', 3], ['torch', 1]], surnames: ['Digby', 'Mould', 'Barrowman', 'Grubb'] }),
  cultAcolyte: wj('Cult Acolyte', 'cult', { ages: [['young', 3], ['adult', 2]], head: [['cultHood', 4], ['hood', 1]], torso: [['robe', 1]], feet: [['wraps', 2], ['shoes', 1]],
    dye: { torso: ['black', 'charcoal', 'crimson', 'plum'], head: ['black', 'crimson', 'charcoal'], trim: ['crimson', 'scarlet', 'bone'] }, x: { belt: 0.8, sigil: 1 }, prop: [['torch', 2], ['ritualKnife', 2], ['none', 1]], surnames: ['the Hollow', 'the Ashen', 'Emberkin'] }),
  cultist: wj('Cult Zealot', 'cult', { head: [['cultHood', 3], ['none', 1]], torso: [['robe', 2], ['gambeson', 1], ['tunic', 1]], legs: [['trousers', 3], ['breeches', 1]], feet: [['wraps', 2], ['boots', 1]],
    dye: { torso: ['crimson', 'black', 'scarlet', 'plum'], under: ['black', 'charcoal'], trim: ['black', 'bone', 'gold'], legs: ['black', 'charcoal'], head: ['crimson', 'black'], mask: ['bone'] },
    x: { sigil: 1, warpaint: 0.5, mask: 0.3, belt: 0.8 }, maskKind: 'skull', prop: [['sickle', 3], ['ritualKnife', 2], ['club', 1]], surnames: ['the Hollow', 'the Ashen', 'Emberkin'] }),
  cultPriest: wj('Cult Hierophant', 'cult', { ages: [['adult', 2], ['old', 2]], head: [['cultHood', 1]], torso: [['robe', 1]], feet: [['shoes', 1]],
    dye: { torso: ['black', 'crimson', 'plum'], head: ['black', 'crimson', 'plum'], trim: ['gold', 'bone'], stole: ['crimson', 'gold', 'bone'], mask: ['bone'] },
    x: { sigil: 1, stole: 1, chain: 0.6, mask: 1 }, maskKind: 'skull', prop: [['cultStaff', 1]], pre: 'Hierophant' }),
};
// (v12, Jordan) where each kind is met, for the game to read when it spawns them: biomes and points of interest,
// the danger bands (1-10, distance from town), the time of day, and how many come together (a camp's chief brings
// its bandits, a coven's hierophant its acolytes and zealots)
export const WILD_WHERE = {
  footpad: { biomes: ['meadow', 'forest'], pois: ['road near town'], bands: [1, 3], time: 'any', group: [1, 1] },
  bandit: { biomes: ['forest', 'meadow'], pois: ['road', 'crossroads', 'bridge', 'bandit camp'], bands: [2, 6], time: 'any', group: [2, 4] },
  banditChief: { biomes: ['forest', 'meadow'], pois: ['bandit camp'], bands: [4, 8], time: 'any', group: [1, 1], leads: ['bandit'] },
  highwayman: { biomes: ['meadow', 'desert'], pois: ['long open road'], bands: [3, 7], time: 'dusk/night', group: [1, 1] },
  deserter: { biomes: ['snow', 'forest'], pois: ['road', 'snow log cabin'], bands: [3, 6], time: 'any', group: [1, 3] },
  poacher: { biomes: ['forest', 'deep forest'], pois: ['wolf and boar ground', 'fairy grotto'], bands: [2, 6], time: 'any', group: [1, 2] },
  raider: { biomes: ['snow', 'coast'], pois: ['shoreline landing'], bands: [6, 10], time: 'any', group: [3, 5] },
  graveRobber: { biomes: ['graveyard'], pois: ['mausoleum', 'graves'], bands: [2, 7], time: 'night', group: [1, 2] },
  cultAcolyte: { biomes: ['swamp', 'desert', 'blasted wastes'], pois: ['great willow', 'sunken obelisk', 'coven'], bands: [3, 8], time: 'night', group: [2, 4] },
  cultist: { biomes: ['swamp', 'desert', 'blasted wastes'], pois: ['great willow', 'sunken obelisk', 'coven'], bands: [4, 9], time: 'night', group: [1, 3] },
  cultPriest: { biomes: ['swamp', 'desert', 'blasted wastes'], pois: ['great willow', 'sunken obelisk'], bands: [6, 10], time: 'night', group: [1, 1], leads: ['cultAcolyte', 'cultist'] },
};
const WILD_LIST = Object.keys(WILDS).map(k => [k, 1]);
Object.assign(JOBS, WILDS);
export const TIERS = { hamlet: 'Hamlet', medium: 'Medium town', large: 'Large town', road: 'On the road', wilds: 'In the wilds', cult: 'Cults' };
export const POOLS = { town: ['hamlet', 'medium', 'large'], wilds: ['road', 'wilds', 'cult'] };
export const jobTitle = d => (d.body === 'fem' && JOBS[d.job].femTitle) || JOBS[d.job].title;

// ---------- names ----------
// Old English and Germanic, from stems (Ald + ric) or whole names; surnames from the trade, a place (Ash + ley) or a
// father (Osric + son).
const NAMES = {
  masc: { pre: ['Ald', 'Bert', 'Ead', 'Os', 'Wulf', 'Leof', 'God', 'Sig', 'Ethel', 'Gar', 'Wil', 'Rand', 'Thur', 'Bald', 'Cuth', 'Dun', 'Ger', 'Her', 'Ing', 'Ans', 'Brand', 'Cyn', 'Hroth', 'Wig', 'Al', 'Eg', 'Fridh'],
    suf: ['ric', 'mund', 'win', 'bert', 'wald', 'helm', 'ulf', 'stan', 'gar', 'frith', 'red', 'ard', 'wine', 'hold', 'mar'],
    whole: ['Godfrey', 'Baldwin', 'Walter', 'Hugo', 'Ingram', 'Merek', 'Jory', 'Tobin', 'Roderick', 'Hamlin', 'Osgood', 'Garrick', 'Dunstan', 'Wystan', 'Ambrose', 'Benedict', 'Conrad', 'Emmerich', 'Fulk', 'Lothar', 'Otto', 'Rainald', 'Ulric', 'Aldous', 'Brom', 'Cedric', 'Edwin', 'Leofric'] },
  fem: { pre: ['Ael', 'Ead', 'Os', 'Wyn', 'Hild', 'Bert', 'Ald', 'Cyne', 'Gode', 'Leof', 'Sig', 'Ethel', 'Mild', 'Ros', 'Ermen', 'Gis', 'Frith', 'Wil', 'Ger', 'Ing', 'Ama'],
    suf: ['gyth', 'hild', 'wyn', 'burh', 'flaed', 'run', 'thryth', 'ith', 'wen', 'ilda', 'frida', 'lind', 'trude', 'ena'],
    whole: ['Matilda', 'Agnes', 'Edith', 'Maud', 'Isolde', 'Rowena', 'Elfreda', 'Gunnhild', 'Hilda', 'Mildred', 'Winifred', 'Ottilie', 'Adelheid', 'Brunhild', 'Elsbeth', 'Gisela', 'Hedwig', 'Ida', 'Liesel', 'Rosamund', 'Sabine', 'Alys', 'Juliana', 'Godiva', 'Aethelind'] },
  place: { pre: ['Ash', 'Thorn', 'Black', 'Brook', 'Elm', 'Hart', 'Oak', 'Stone', 'Wick', 'Mar', 'Fen', 'Holt', 'Rye', 'Wold', 'Red', 'Cold', 'Bram', 'Hazel', 'Lang', 'Alder', 'Crow', 'Kirk', 'Ember', 'Wester', 'Hollow', 'Barrow'],
    suf: ['ley', 'ford', 'wood', 'wick', 'by', 'ham', 'ton', 'field', 'more', 'dale', 'well', 'brook', 'holt', 'stead', 'hurst', 'worth'] },
};
const oneOf = (r, a) => a[Math.floor(r() * a.length)];
const join = (a, b) => {
  if (a.toLowerCase() === b) return a + 'a';
  return a.slice(-1).toLowerCase() === b[0] ? a + b.slice(1) : a + b;
};
function makeName(r, body, J) {
  const N = NAMES[body];
  const first = r() < 0.45 ? oneOf(r, N.whole) : join(oneOf(r, N.pre), oneOf(r, N.suf));
  const u = r();
  let last;
  if (J.surnames.length && u < 0.4) last = oneOf(r, J.surnames);
  else if (u < 0.8) last = join(oneOf(r, NAMES.place.pre), oneOf(r, NAMES.place.suf));
  else last = (r() < 0.5 ? oneOf(r, NAMES.masc.whole) : join(oneOf(r, NAMES.masc.pre), oneOf(r, NAMES.masc.suf))) + 'son';
  // churchmen go by their first name and a place (of Ashford), soldiers by rank
  if (J === JOBS.bishop || J === JOBS.priest || J === JOBS.choir) last = 'of ' + join(oneOf(r, NAMES.place.pre), oneOf(r, NAMES.place.suf));
  const pre = J.pre ? J.pre : J === JOBS.bishop ? 'Bishop' : J === JOBS.captain ? 'Captain' : J === JOBS.priest ? (body === 'fem' ? 'Mother' : 'Father') : J === JOBS.elder ? (body === 'fem' ? 'Old Mother' : 'Old') : '';
  return { first, last, full: [pre, first, last].filter(Boolean).join(' ') };
}

// ---------- the design ----------
export const HAIR_STYLES = {
  masc: [['short', 6], ['crop', 4], ['bald', 2], ['shaggy', 3], ['ponytail', 1], ['long', 1]],
  fem: [['long', 5], ['bob', 3], ['bun', 4], ['braid', 4], ['ponytail', 3], ['short', 1]],
};
export function design(seed, pool = 'town') {
  const r = folkRand(seed);
  const body = r() < 0.5 ? 'masc' : 'fem';
  const job = pick(r, pool === 'wilds' ? WILD_LIST : JOB_LIST), J = JOBS[job];
  const age = pick(r, J.ages || [['young', 4], ['adult', 6], ['old', 2]]);
  const d = { seed, body, age, job, tier: J.tier };
  d.height = 0.95 + r() * 0.1;
  d.build = body === 'masc' ? 0.96 + r() * 0.12 : 0.95 + r() * 0.08;
  d.skin = jitter(r, SKIN[Math.floor(r() * SKIN.length)], 0.03);
  const hk = age === 'old' ? pick(r, [['grey', 5], ['white', 4], ['darkBrown', 1]])
    : pick(r, [['black', 4], ['darkBrown', 5], ['brown', 5], ['chestnut', 3], ['auburn', 2], ['ginger', 1], ['blonde', 2], ['flaxen', 1]]);
  d.hairName = hk; d.hair = jitter(r, HAIR[hk], 0.04);
  d.hairStyle = pick(r, HAIR_STYLES[body]);
  if (age === 'old' && body === 'masc' && r() < 0.35) d.hairStyle = 'bald';
  d.beard = body === 'masc' && age !== 'young' ? pick(r, [['none', 5], ['stubble', 2], ['moustache', 2], ['full', 3]]) : 'none';
  // the job's clothes, each in one of the job's dyes (the legs kept off the torso's dye where the job allows)
  const sw = it => SWAP[body][it] || it, list = l => l.map(([it, w]) => [sw(it), w]);
  const tint = keys => { const k = oneOf(r, keys); return { dye: k, color: jitter(r, DYES[k][0]) }; };
  const D = J.dye;
  d.head = { item: pick(r, list(J.head)) };
  d.torso = { item: pick(r, list(J.torso)) };
  d.legs = { item: WHOLE.includes(d.torso.item) ? d.torso.item : pick(r, list(J.legs)) };
  d.feet = { item: pick(r, J.feet) };
  Object.assign(d.torso, tint(D.torso));
  // what shows under a vest, bodice or tabard, and the surplice's white over its cassock
  if (['vest', 'bodice', 'tabard', 'surplice', 'jerkin'].includes(d.torso.item)) d.torso.under = tint(D.under || ['linen', 'linen', 'wool', 'oat']);
  d.torso.trim = D.trim ? tint(D.trim).color : shade(d.torso.color, -0.35);
  if (WHOLE.includes(d.legs.item)) Object.assign(d.legs, { dye: d.torso.dye, color: d.torso.color });
  else { let t = tint(D.legs || PLAIN); for (let n = 0; n < 4 && t.dye === d.torso.dye && (D.legs || PLAIN).length > 1; n++) t = tint(D.legs || PLAIN); Object.assign(d.legs, t); }
  d.legs.stockings = r() < 0.6 ? jitter(r, pick(r, [[DYES.linen[0], 3], [DYES.wool[0], 3], [DYES.grey[0], 1], [DYES.umber[0], 1]])) : shade(d.legs.color, -0.25);
  const hat = d.head.item;
  if (hat === 'strawHat') Object.assign(d.head, { dye: 'straw', color: jitter(r, STRAW, 0.05), band: tint(D.head || EARTH).color });
  else if (hat === 'kettleHat' || hat === 'nasalHelm') Object.assign(d.head, { dye: 'iron', color: jitter(r, '#8e949e', 0.05) });
  else if (hat !== 'none') Object.assign(d.head, tint(D.head || D.torso), { trim: D.trim ? tint(D.trim).color : null, feather: tint(['white', 'scarlet', 'weld', 'teal', 'black']).color });
  d.feet.color = d.feet.item === 'wraps' ? tint(D.legs || PLAIN).color : jitter(r, LEATHER[Math.floor(r() * LEATHER.length)], 0.05);
  d.feet.sole = shade(d.feet.color, -0.4);
  const X = J.x, roll = p => p && r() < p;
  const leather = () => jitter(r, LEATHER[Math.floor(r() * LEATHER.length)], 0.05);
  d.belt = d.torso.item === 'robe' ? (roll(X.belt ?? 0.7) ? { color: tint(['oat', 'white', 'umber', 'gold']).color, cord: true } : null)
    : ['dress', 'gown'].includes(d.torso.item) ? (roll(X.belt ?? 0.5) ? { color: tint(D.trim || EARTH).color, sash: true } : null)
    : roll(X.belt ?? 0.5) ? { color: leather(), buckle: r() < 0.6 } : null;
  d.apron = roll(X.leatherApron) ? { color: leather(), bib: true, heavy: true }
    : roll(X.apron) ? { color: tint(D.apron || ['white', 'linen']).color, bib: r() < (X.apronBib ?? 0.4) } : null;
  d.gloves = roll(X.gloves) ? leather() : null;
  d.chain = roll(X.chain) ? jitter(r, DYES.gold[0], 0.04) : null;
  d.satchel = roll(X.satchel) ? leather() : null;
  d.stole = roll(X.stole) ? tint(D.stole || ['white']).color : null;
  d.cloak = roll(X.cloak) ? tint(D.cloak || D.torso).color : null;
  d.sword = !!X.sword;
  d.shawl = body === 'fem' && hat !== 'hood' && hat !== 'cultHood' && roll(X.shawl ?? 0.1) ? { color: tint(D.head || D.torso).color } : null;
  d.neckerchief = body === 'masc' && hat !== 'hood' && hat !== 'cultHood' && roll(X.neckerchief ?? 0.1) ? { color: tint(['madder', 'weld', 'woad', 'scarlet', 'white']).color } : null;
  d.prop = Array.isArray(J.prop) ? pick(r, J.prop) : J.prop || 'none';
  d.eyes = pick(r, [['#1e1814', 6], ['#2a3a5a', 2], ['#3a4a2a', 2], ['#4a3020', 2]]);
  // the bust's size, lift and sag, each 0..1; sag comes from age (Jordan): young 0-0.25, adult 0.25-0.6, old 0.6-1
  const SAG = { young: [0, 0.25], adult: [0.25, 0.6], old: [0.6, 1] }[age];
  if (body === 'fem') d.bust = { size: r(), lift: r(), sag: SAG[0] + r() * (SAG[1] - SAG[0]) };
  d.name = makeName(r, body, J);
  // (v9) the hostile folk's own pieces, rolled after everything else
  if (J.hostile) {
    d.hostile = true;
    d.mask = roll(X.mask) ? { kind: J.maskKind || 'cloth', color: tint(D.mask || ['charcoal']).color } : null;
    d.furs = roll(X.furs) ? jitter(r, pick(r, [['#8a7a64', 3], ['#5e4e3e', 3], ['#a8a090', 2], ['#3e342a', 2], ['#c8c0b0', 1]]), 0.05) : null;
    d.quiver = roll(X.quiver) ? leather() : null;
    d.shield = roll(X.shield) ? { color: tint(D.shield || ['umber']).color, trim: tint(['bone', 'charcoal', 'ochre', 'madder']).color } : null;
    d.sigil = roll(X.sigil) ? (D.trim ? tint(D.trim).color : '#b8282a') : null;
    d.warpaint = roll(X.warpaint) ? tint(['woad', 'ochre', 'black', 'crimson', 'white']).color : null;
    if (hat === 'cultHood') d.head.glow = pick(r, [['#ff5a2a', 3], ['#ffd24a', 1], ['#7ae0ff', 1], ['#c070ff', 1]]);
  }
  return d;
}
// ---------- (v21, Jordan) desert dress ----------
// In a town walled in sandstone the everyday trades dress for the heat: a turban or a round cap (a headscarf for
// the women), a long tunic to the shin over trousers (sometimes a short vest over it) or an ankle-length kaftan
// with a trimmed front, a wide cloth sash, slippers or sandals. desertDress(d) gives a town design's desert
// version: the same person (body, face, hair, job, name, tool, apron, gloves...) with their clothes rolled again
// from a stream of their own (so design() and every seed's ordinary look are untouched). Jobs not listed keep their
// clothes: the watch's uniforms and the clergy's vestments. 'work' wears the tunic, 'robe' the kaftan, 'either' rolls.
export const DESERT_JOBS = {
  elder: 'robe', smith: 'work', tanner: 'work', woodcutter: 'work', goodfolk: 'either', lamplighter: 'work',
  ironmonger: 'work', armorer: 'work', glazier: 'work', mason: 'work', herbalist: 'robe', innkeeper: 'either', carter: 'work', sweeper: 'work',
  masterSmith: 'work', jeweller: 'robe', merchant: 'robe', banker: 'robe', cartographer: 'robe', busker: 'either', flowerSeller: 'either',
  crier: 'either', gossip: 'either', pickpocket: 'work',
};
const DESERT = {
  turban: [['white', 6], ['linen', 3], ['oat', 2], ['woad', 1], ['madder', 1], ['weld', 1], ['navy', 1]],
  cap: [['white', 3], ['umber', 3], ['brown', 2], ['madder', 1], ['charcoal', 1]],
  scarf: [['white', 2], ['linen', 2], ['madder', 2], ['woad', 2], ['teal', 2], ['ochre', 1], ['plum', 1], ['oat', 1]],
  kaftan: [['madder', 3], ['crimson', 2], ['navy', 2], ['teal', 2], ['woad', 2], ['ochre', 2], ['white', 2], ['oat', 1], ['plum', 1]],
  richKaftan: [['crimson', 3], ['navy', 2], ['plum', 2], ['teal', 2], ['madder', 2], ['white', 1]],
  tunic: [['white', 5], ['linen', 4], ['oat', 3], ['wool', 1], ['ochre', 1]],
  vest: [['umber', 3], ['brown', 3], ['madder', 2], ['teal', 1], ['navy', 1], ['ochre', 1]],
  dress: [['madder', 2], ['woad', 2], ['ochre', 2], ['teal', 2], ['oat', 1], ['linen', 1], ['plum', 1], ['rose', 1]],
  trousers: [['umber', 3], ['charcoal', 2], ['brown', 2], ['oat', 1], ['navy', 1], ['linen', 1]],
  sash: [['madder', 3], ['weld', 2], ['teal', 2], ['woad', 2], ['white', 1], ['crimson', 2], ['gold', 1], ['ochre', 1]],
  trim: [['gold', 3], ['weld', 2], ['white', 2], ['teal', 2], ['crimson', 1]],
};
const DESERT_RICH = ['jeweller', 'merchant', 'banker'];
export function desertDress(d0) {
  const how = DESERT_JOBS[d0.job];
  if (!how || d0.hostile) return d0;
  const d = JSON.parse(JSON.stringify(d0)), r = folkRand(((d0.seed >>> 0) ^ 0x5a17d35e) >>> 0 || 7), fem = d.body === 'fem';
  const tint = list => { const k = pick(r, list); return { dye: k, color: jitter(r, DYES[k][0]) }; };
  const wear = how === 'either' ? (r() < 0.45 ? 'robe' : 'work') : how;
  // the head: a turban or a round cap, a headscarf for a woman (now and then bare-headed)
  const hat = fem ? pick(r, [['headscarf', 6], ['none', 1]]) : pick(r, wear === 'robe' ? [['turban', 6], ['taqiyah', 2], ['none', 1]] : [['turban', 4], ['taqiyah', 3], ['none', 1]]);
  d.head = hat === 'none' ? { item: 'none' } : Object.assign({ item: hat }, tint(hat === 'turban' ? DESERT.turban : hat === 'taqiyah' ? DESERT.cap : DESERT.scarf));
  if (hat === 'headscarf') d.head.trim = shade(d.head.color, -0.2);
  const stock = d.legs.stockings;
  if (wear === 'robe') {
    // the kaftan, to the ankle, its front edged in a trim
    d.torso = Object.assign({ item: 'robe', kaftan: true }, tint(DESERT_RICH.includes(d.job) ? DESERT.richKaftan : DESERT.kaftan));
    d.torso.trim = tint(DESERT.trim).color;
    d.legs = { item: 'robe', dye: d.torso.dye, color: d.torso.color, stockings: stock };
  } else if (fem) {
    // a long dress in a desert dye (or a blouse over a long skirt), the hem to the ankle
    if (r() < 0.6) { d.torso = Object.assign({ item: 'dress' }, tint(DESERT.dress)); d.legs = { item: 'dress', dye: d.torso.dye, color: d.torso.color, stockings: stock }; }
    else { d.torso = Object.assign({ item: 'blouse' }, tint(DESERT.tunic)); d.legs = Object.assign({ item: 'longSkirt', stockings: stock }, tint(DESERT.dress)); }
    d.torso.trim = shade(d.torso.color, -0.35);
  } else {
    // a long tunic to the shin over trousers, sometimes a short vest over it
    const vest = r() < 0.35;
    if (vest) { d.torso = Object.assign({ item: 'vest', long: true }, tint(DESERT.vest)); d.torso.under = tint(DESERT.tunic); }
    else d.torso = Object.assign({ item: 'tunic', long: true }, tint(DESERT.tunic));
    d.torso.trim = shade(d.torso.color, -0.35);
    d.legs = Object.assign({ item: 'trousers', stockings: stock }, tint(DESERT.trousers));
  }
  // slippers or sandals (cloth wraps)
  d.feet = { item: pick(r, [['shoes', 3], ['wraps', 2]]) };
  d.feet.color = d.feet.item === 'wraps' ? jitter(r, LEATHER[Math.floor(r() * LEATHER.length)], 0.05) : tint([['ochre', 1], ['madder', 1], ['umber', 2], ['oat', 1]]).color;
  d.feet.sole = shade(d.feet.color, -0.4);
  // a wide cloth sash at the waist, in place of a leather belt
  d.belt = r() < (wear === 'robe' ? 0.9 : 0.75) ? { color: tint(DESERT.sash).color, sash: true, wide: true } : null;
  d.cloak = null; d.shawl = null; d.neckerchief = null;
  d.desert = true;
  return d;
}
// a design in words, for the viewer's readout
export function describe(d) {
  const nice = s => s.replace(/([A-Z])/g, ' $1').toLowerCase();
  const rows = [
    ['Body', `${d.body === 'fem' ? 'feminine' : 'masculine'}, ${d.age}, height ${d.height.toFixed(2)}`],
    ['Hair', `${nice(d.hairStyle)}, ${nice(d.hairName)}${d.beard !== 'none' ? ', ' + nice(d.beard) + (d.beard === 'full' ? ' beard' : '') : ''}`, d.hair],
    ['Head', d.head.item === 'none' ? 'nothing' : `${nice(d.head.item)}${d.head.dye ? ', ' + d.head.dye : ''}`, d.head.color],
    ['Torso', `${d.torso.long ? 'long ' : ''}${d.torso.kaftan ? 'kaftan' : nice(d.torso.item)}, ${d.torso.dye}${d.torso.under ? ' over ' + d.torso.under.dye : ''}`, d.torso.color],
    ['Legs', WHOLE.includes(d.legs.item) ? `the ${d.torso.kaftan ? 'kaftan' : nice(d.legs.item)}'s skirt` : `${nice(d.legs.item)}, ${d.legs.dye}`, d.legs.color],
    ['Feet', `${nice(d.feet.item)}`, d.feet.color],
  ];
  if (d.bust) rows.splice(1, 0, ['Bust', `size ${d.bust.size.toFixed(2)}, lift ${d.bust.lift.toFixed(2)}, sag ${d.bust.sag.toFixed(2)}`]);
  const extra = [d.apron && (d.apron.heavy ? 'leather apron' : 'apron'), d.cloak && 'cloak', d.stole && 'stole', d.chain && 'chain of office', d.gloves && 'gloves',
    d.satchel && 'satchel', d.sword && 'sword', d.shawl && 'shawl', d.neckerchief && 'neckerchief',
    d.mask && (d.mask.kind === 'skull' ? 'skull mask' : 'face cloth'), d.furs && 'fur mantle', d.quiver && 'quiver', d.shield && 'shield on the back',
    d.sigil && 'cult sigil', d.warpaint && 'war paint', d.head.glow && 'glowing eyes', d.belt && (d.belt.sash ? 'sash' : d.belt.cord ? 'cord belt' : 'belt')].filter(Boolean);
  if (extra.length) rows.push(['Extras', extra.join(', ')]);
  if (d.prop !== 'none') rows.push(['Holding', nice(d.prop)]);
  const W = WILD_WHERE[d.job];
  if (W) rows.push(['Found', `${W.biomes.join(', ')}; ${W.pois.join(', ')}; bands ${W.bands[0]}-${W.bands[1]}; ${W.time === 'any' ? 'day or night' : W.time}; ${W.group[0] === W.group[1] ? W.group[0] : W.group.join('-')} at a time${W.leads ? ', leading ' + W.leads.map(k => JOBS[k].title.toLowerCase() + 's').join(' and ') : ''}`]);
  return rows;
}

// ---------- the build ----------
export function makeFolkKit(GFX) {
  const mats = new Map();
  const mat = c => { let m = mats.get(c); if (!m) { m = new GFX.MeshStandardMaterial({ color: c, flatShading: true, roughness: 1, metalness: 0 }); mats.set(c, m); } return m; };
  const shadowMat = new GFX.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.32, depthWrite: false });
  const shadowGeo = new GFX.CircleGeometry(0.28, 10).rotateX(-Math.PI / 2);

  function build(d) {
    const g = new GFX.Group(), parts = [];
    // (v3: each box a hair bigger than the one before, cycling every 7 (v8; it was 17, whose 6 mm swing could shrink a
    // trim below what it covers), in a step that's no round number so it never lands back on the hand-set sizes: two
    // boxes whose faces would lie in one plane never do, so pieces that meet flush don't z-fight. v8: anything laid
    // over another piece stands at least 2 mm proud of it by hand, since faces under ~1 mm apart still fought.)
    let nBox = 0;
    const box = (parent, w, h, dd, x, y, z, c, rx = 0, rz = 0, ry = 0) => {
      const e = 0.00037 * (nBox++ % 7);
      const m = new GFX.Mesh(new GFX.BoxGeometry(w + e, h + e, dd + e), mat(c)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); parts.push(m); return m;
    };
    // (v4, Jordan: angled shapes for the feminine build) a tapered block: its bottom face at y0 (width wb, depth db,
    // centred on xb, zb) and its top at y1 (wt, dt, at xt, zt), straight sides between: a box whose top is a different
    // size, or set off, from its bottom. The renderer shades each face flat from its own slope.
    const taper = (parent, y0, y1, [wb, db, xb = 0, zb = 0], [wt, dt, xt = 0, zt = 0], c) => {
      const e = 0.00037 * (nBox++ % 7), geo = new GFX.BoxGeometry(1, 1, 1);
      geo._transform(v => {
        const top = v.y > 0, w = (top ? wt : wb) + e, dd = (top ? dt : db) + e;
        v.set(v.x * w + (top ? xt : xb), top ? y1 + e / 2 : y0 - e / 2, v.z * dd + (top ? zt : zb));
      });
      const m = new GFX.Mesh(geo, mat(c)); parent.add(m); parts.push(m); return m;
    };
    // (v6) a solid lofted through rings, bottom to top: each ring [y, width, depth, x, z], straight sides between
    // them and a cap at each end. One mesh, so the rings' joins are true edges: tapers stacked as separate pieces
    // overlapped at every join and drew doubled lines there.
    const loft = (parent, rings, c) => {
      const e = 0.00037 * (nBox++ % 7), pos = [];
      const C = rings.map(([y, w, dd, x = 0, z = 0]) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [x + sx * (w + e) / 2, y, z + sz * (dd + e) / 2]));
      const tri = (a, b, cc) => pos.push(...a, ...b, ...cc);
      for (let i = 0; i < C.length - 1; i++) for (let j = 0; j < 4; j++) {
        const k = (j + 1) % 4, L = C[i], U = C[i + 1];
        tri(L[j], U[k], L[k]); tri(L[j], U[j], U[k]);
      }
      const b = C[0], t = C[C.length - 1];
      tri(b[0], b[1], b[2]); tri(b[0], b[2], b[3]);
      tri(t[0], t[2], t[1]); tri(t[0], t[3], t[2]);
      const geo = new GFX.BufferGeometry();
      geo.setAttribute('position', new GFX.Float32BufferAttribute(pos, 3));
      const m = new GFX.Mesh(geo, mat(c)); parent.add(m); parts.push(m); return m;
    };
    const pivot = (parent, x, y, z) => { const p = new GFX.Group(); p.position.set(x, y, z); parent.add(p); return p; };
    const fem = d.body === 'fem', T = d.torso, L = d.legs, skin = d.skin;
    // the build: shoulders, waist and hips across, the chest's depth, a limb's thickness
    const B = fem ? { sh: 0.24, wa: 0.21, hip: 0.27, dep: 0.15, legX: 0.064, leg: 0.088, arm: 0.068, shoulder: 0.152 }
      : { sh: 0.28, wa: 0.27, hip: 0.29, dep: 0.16, legX: 0.07, leg: 0.1, arm: 0.08, shoulder: 0.175 };
    const skirted = ['skirt', 'longSkirt', ...WHOLE].includes(L.item);
    const hem = L.item === 'skirt' ? 0.17 : ['robe', 'surplice', 'gown'].includes(L.item) ? 0.05 : 0.07;
    const upper = T.under ? T.under.color : T.color;      // (the sleeves: the shirt's under a vest, bodice or tabard)
    const overUnder = ['vest', 'bodice', 'tabard', 'surplice', 'jerkin'].includes(T.item);

    const body = pivot(g, 0, 0, 0);
    // ---- legs: hip, knee, ankle (the hero's joints) ----
    const legL = pivot(body, B.legX, 0.36, 0), legR = pivot(body, -B.legX, 0.36, 0), KNEE = -0.14, ANKLE = -0.3;
    const knees = [], ankles = [];
    const thighC = skirted ? L.stockings : L.color;
    const shinC = skirted || L.item === 'breeches' ? L.stockings : L.color;
    for (const leg of [legL, legR]) {
      box(leg, B.leg, -KNEE, B.leg + 0.01, 0, KNEE / 2, 0, thighC);
      const shin = pivot(leg, 0, KNEE, 0); knees.push(shin);
      box(shin, B.leg - 0.004, 0.12, B.leg + 0.006, 0, -0.04, 0, shinC);
      // breeches end in a band just under the knee
      if (L.item === 'breeches') box(shin, B.leg + 0.008, 0.045, B.leg + 0.018, 0, -0.015, 0, shade(L.color, -0.2));
      const foot = pivot(shin, 0, ANKLE - KNEE, 0); ankles.push(foot);
      const F = d.feet;
      if (F.item === 'boots') {
        box(foot, B.leg + 0.01, 0.13, 0.15, 0, 0.005, 0.015, F.color);
        box(foot, B.leg + 0.025, 0.035, 0.155, 0, 0.06, 0.01, shade(F.color, -0.3));
      } else if (F.item === 'shoes') {
        box(foot, B.leg - 0.006, 0.09, B.leg + 0.004, 0, 0.03, 0, shinC);              // the ankle, in stocking or trouser
        box(foot, B.leg + 0.006, 0.06, 0.15, 0, -0.03, 0.018, F.color);
        box(foot, B.leg + 0.012, 0.015, 0.158, 0, -0.056, 0.018, F.sole);
      } else {
        // cloth foot wraps, bound with two darker bands
        box(foot, B.leg, 0.11, 0.14, 0, -0.005, 0.015, F.color);
        for (const y of [0.0, 0.035]) box(foot, B.leg + 0.008, 0.014, B.leg + 0.014, 0, y, 0, shade(F.color, -0.35));
        box(foot, B.leg + 0.006, 0.014, 0.145, 0, -0.045, 0.015, shade(F.color, -0.35));
      }
    }
    // ---- hips and waist ----
    const hipC = skirted ? L.color : T.item === 'tunic' || T.item === 'gambeson' ? T.color : L.color;
    // the feminine torso narrows from the hips to the waist and widens again to the shoulders; torsoAt(y) gives its
    // width and depth at a height (chest pieces), hipAt(y) the hips'
    const lerp = (a, b, u) => a + (b - a) * u, clampU = u => Math.max(0, Math.min(1, u));
    const HIP = { y0: 0.3, y1: 0.44, w0: B.hip + 0.01, d0: B.dep + 0.02, w1: B.wa - 0.005, d1: B.dep - 0.012 };
    const TOR = { y0: 0.41, y1: 0.67, w0: B.wa - 0.005, d0: B.dep - 0.012, w1: B.sh, d1: B.dep };
    const at = (P, y) => { const u = clampU((y - P.y0) / (P.y1 - P.y0)); return [lerp(P.w0, P.w1, u), lerp(P.d0, P.d1, u)]; };
    const torsoAt = y => at(TOR, y), hipAt = y => at(HIP, y);
    // the bust's profile, bottom to top: [height, front z, width] (see the chest, below)
    let BUST = null;
    if (fem) {
      const b = d.bust || { size: 0.5, lift: 0.5, sag: 0.3 }, F = y => torsoAt(y)[1] / 2;
      const yApex = 0.545 + b.lift * 0.035 - b.sag * 0.025, out = 0.022 + b.size * 0.028;
      const yMid = yApex - 0.022 - b.sag * 0.018 - b.size * 0.008, yLow = yMid - 0.02 - b.sag * 0.01;
      BUST = [[yLow, F(yLow) - 0.002, B.sh - 0.07], [yMid, F(yMid) + out * (0.62 - b.sag * 0.15), B.sh - 0.05],
        [yApex, F(yApex) + out, B.sh - 0.035 + b.size * 0.01], [0.64, F(0.64) - 0.004, B.sh - 0.035]];
    }
    if (fem) taper(body, HIP.y0, HIP.y1, [HIP.w0, HIP.d0], [HIP.w1, HIP.d1], hipC);
    else box(body, B.hip, 0.09, B.dep + 0.01, 0, 0.36, 0, hipC);
    // skirts and the tunic's tails hang in a left and a right half, each swinging with its leg a little (so the
    // legs never come through), a little wider at the hem
    const flaps = [];
    // (v4) each half a tapered block: from the waist, flaring out and forward to the hem, its inner edge on the middle
    // line (the right half a touch deeper where they overlap, so the two never z-fight)
    const SK = { top: fem ? 0.43 : 0.41 };
    const skirtAt = (y, P) => { const u = clampU((SK.top - y) / (SK.top - P.bottom)); return [lerp(P.wt, P.wb, u), lerp(P.dt, P.db, u)]; };
    let skirtP = null;
    const skirtHalves = (color, bottom, flare, grow = 0) => {
      const wt = (fem ? hipAt(SK.top)[0] / 2 + 0.012 : B.hip / 2 + 0.008) + grow / 2, dt = (fem ? hipAt(SK.top)[1] + 0.016 : B.dep + 0.03) + grow;
      const P = skirtP = { bottom, wt, dt, wb: wt + flare * 0.5, db: dt + flare };
      for (const s of [1, -1]) {
        const off = 0.05, p = pivot(body, s * off, 0.4, 0); flaps.push(p);
        const dz = s > 0 ? 0.004 : 0, cx = w => s * (w / 2 - off - 0.004);
        const yt = SK.top - 0.4, yb = bottom - 0.4;
        taper(p, yb + 0.02, yt, [P.wb, P.db + dz, cx(P.wb)], [P.wt, P.dt + dz, cx(P.wt)], color);
        // a darker hem band, standing a hair proud of the skirt
        const [w1, d1] = skirtAt(bottom + 0.028, P);
        taper(p, yb, yb + 0.028, [P.wb + 0.006, P.db + 0.006 + dz, cx(P.wb + 0.006)], [w1 + 0.006, d1 + 0.006 + dz, cx(w1 + 0.006)], shade(color, -0.22));
      }
    };
    if (skirted) skirtHalves(L.color, hem, L.item === 'skirt' ? 0.07 : ['dress', 'gown'].includes(L.item) ? 0.12 : 0.1);
    else if (T.item === 'tunic') skirtHalves(T.color, T.long ? 0.13 : 0.25, T.long ? 0.05 : 0.02);
    // (v21) the desert's long tunic showing below a vest, to the shin
    else if (T.long) skirtHalves(T.under ? T.under.color : T.color, 0.13, 0.05);
    else if (T.item === 'gambeson') skirtHalves(T.color, 0.25, 0.02);
    else if (T.item === 'doublet') skirtHalves(T.color, 0.3, 0.03);
    // the surplice: a white over-skirt to the knee on the cassock (its skirt kept for the sash and apron below)
    if (T.item === 'surplice') { const keep = skirtP; skirtHalves(T.under.color, 0.24, 0.14, 0.016); skirtP = keep; }
    // ---- the chest (the waist pivot) ----
    const chest = pivot(body, 0, 0.42, 0), CH = 0.42;
    const torsoC = overUnder ? T.under.color : T.color;
    // upper chest across the shoulders, the lower narrower at the waist
    if (fem) {
      // (v4) one tapered block from the waist up to the shoulders
      taper(chest, TOR.y0 - CH, TOR.y1 - CH, [TOR.w0, TOR.d0], [TOR.w1, TOR.d1], torsoC);
      // (v5, Jordan: the v4 wedge was too sharp and low) the bust in profile: a long slope out from high on the chest
      // to the fullest point, then two facets turning back under it to the ribs. Size pushes the fullest point out,
      // lift raises it, sag lowers it and drops the underside further below it.
      // (v6: one lofted solid, its back sunk in the chest)
      const back = y => torsoAt(y)[1] / 2 - 0.03;
      loft(chest, BUST.map(([y, z, w]) => [y - CH, w, z - back(y), 0, (z + back(y)) / 2]), torsoC);
    } else {
      box(chest, B.sh, 0.16, B.dep, 0, 0.59 - CH, 0, torsoC);
      box(chest, B.wa, 0.16, B.dep - 0.006, 0, 0.45 - CH, 0, torsoC);
    }
    // the front of the chest at a height (for the pieces laid on it)
    const frontAt = y => (fem ? torsoAt(y)[1] : y > 0.51 ? B.dep : B.dep - 0.006) / 2;
    // the bust's front at a height (feminine), for what lies over it
    const bustFront = y => {
      if (y <= BUST[0][0]) return BUST[0][1];
      for (let i = 0; i < BUST.length - 1; i++) if (y <= BUST[i + 1][0]) return lerp(BUST[i][1], BUST[i + 1][1], (y - BUST[i][0]) / (BUST[i + 1][0] - BUST[i][0]));
      return BUST[BUST.length - 1][1];
    };
    // the skirt's front at a height, for the sash and apron over it
    const skirtFront = y => skirtP ? skirtAt(y, skirtP)[1] / 2 + 0.004 : 0;
    // the chest's front at a height, over the bust where there is one
    const chestFront = y => fem && y >= BUST[0][0] && y <= BUST[BUST.length - 1][0] ? Math.max(frontAt(y), bustFront(y)) : frontAt(y);
    // (v7) a cloth panel laid on the front of the chest from y0 up to y1, over the bust's facets on the feminine build
    const chestPanel = (x, w, y0, y1, c, lift = 0.008, thick = 0.012) => {
      if (!fem) return box(chest, w, y1 - y0, thick, x, (y0 + y1) / 2 - CH, frontAt((y0 + y1) / 2) + lift, c);
      const ys = [y0, ...BUST.map(q => q[0]).filter(y => y > y0 + 0.002 && y < y1 - 0.002), y1];
      return loft(chest, ys.map(y => [y - CH, w, thick, x, chestFront(y) + lift]), c);
    };
    // a panel hanging below the waist, in front (side 1) or behind (side -1), on a pivot at the waist that swings
    // out of the legs' way (fronts with the leg ahead, backs with the leg behind), laid down the skirt's slope
    const fronts = [], backs = [];
    const hangPanel = (side, x, wTop, wBot, bottom, c, lift = 0.01) => {
      const pv = pivot(body, 0, 0.42, 0); (side > 0 ? fronts : backs).push(pv);
      const zAt = y => (skirtP ? skirtFront(y) : (fem ? hipAt(y)[1] : B.dep + 0.01) / 2) + lift;
      taper(pv, bottom - 0.42, 0, [wBot, 0.012, x, side * zAt(bottom)], [wTop, 0.012, x, side * zAt(0.42)], c);
      return pv;
    };
    if (T.item === 'vest') {
      // a sleeveless vest, open down the front over the shirt, with two buttons each side
      for (const s of [1, -1]) {
        // (v3: a hair taller than the shirt under it, so their tops never share a plane)
        box(chest, B.sh / 2 - 0.016, 0.17, B.dep + 0.012, s * (B.sh / 4 + 0.012), 0.593 - CH, 0, T.color);
        box(chest, B.wa / 2 - 0.016, 0.17, B.dep + 0.006, s * (B.wa / 4 + 0.012), 0.45 - CH, 0, T.color);
        for (const y of [0.5, 0.58]) box(chest, 0.018, 0.018, 0.008, s * 0.035, y - CH, B.dep / 2 + 0.007, T.trim);
      }
    } else if (T.item === 'bodice') {
      // a laced bodice from the bust to the waist over a blouse
      if (fem) {
        // (v4) following the torso's taper, up to just under the bust
        const yt = BUST[0][0] + 0.004, [w0, d0] = torsoAt(0.4), [w1, d1] = torsoAt(yt);
        taper(chest, 0.4 - CH, yt - CH, [w0 + 0.014, d0 + 0.012], [w1 + 0.014, d1 + 0.012], T.color);
      } else {
        box(chest, B.wa + 0.012, 0.2, B.dep + 0.008, 0, 0.47 - CH, 0, T.color);
        box(chest, B.sh - 0.04, 0.05, B.dep + 0.004, 0, 0.555 - CH, 0, T.color);
      }
      if (!(d.apron && d.apron.bib)) for (const y of [0.455, 0.49, 0.52]) for (const s of [1, -1]) box(chest, 0.05, 0.008, 0.006, 0, y - CH, frontAt(y) + 0.0095, T.trim, 0, s * 0.6);
    } else if (T.item === 'dress') {
      // a square neckline in the trim
      box(chest, 0.11, 0.02, 0.006, 0, 0.645 - CH, frontAt(0.645) + 0.003, T.trim);
    } else if (T.item === 'gown') {
      // a fine gown: a stomacher in the trim from the waist to under the bust, and the neckline trimmed
      if (fem) taper(chest, 0.41 - CH, BUST[0][0] + 0.004 - CH, [0.07, torsoAt(0.41)[1] + 0.012], [0.1, torsoAt(BUST[0][0])[1] + 0.012], T.trim);
      box(chest, 0.13, 0.02, 0.006, 0, 0.645 - CH, frontAt(0.645) + 0.003, T.trim);
    } else if (T.item === 'tabard') {
      // a tabard over the shirt: front and back panels from the shoulders to the thigh, open at the sides, with the
      // town's diamond on the breast
      const w = B.sh - 0.05;
      chestPanel(0, w, 0.42, 0.665, T.color, 0.01, 0.014);
      box(chest, w, 0.245, 0.014, 0, 0.5425 - CH, -(frontAt(0.54) + 0.01), T.color);
      box(chest, w + 0.004, 0.02, B.dep + 0.03, 0, 0.665 - CH, 0, T.color);
      hangPanel(1, 0, w, w + 0.02, 0.24, T.color, 0.014); hangPanel(-1, 0, w, w + 0.02, 0.24, T.color, 0.014);
      box(chest, 0.06, 0.06, 0.008, 0, 0.56 - CH, chestFront(0.56) + 0.022, T.trim, 0, Math.PI / 4);
    } else if (T.item === 'doublet') {
      // a fitted doublet: a band of the trim down the front with buttons, its skirt cut short (above)
      box(chest, 0.04, 0.26, 0.006, 0, 0.54 - CH, frontAt(0.54) + 0.004, T.trim);
      for (const y of [0.46, 0.51, 0.56, 0.61]) box(chest, 0.018, 0.018, 0.008, 0, y - CH, frontAt(y) + 0.009, '#c8a048');
      box(chest, B.sh + 0.012, 0.034, B.dep + 0.012, 0, 0.656 - CH, 0, T.trim);
    } else if (T.item === 'robe') {
      // a plain round collar in a darker fold
      box(chest, B.sh - 0.06, 0.025, B.dep + 0.012, 0, 0.66 - CH, 0, shade(T.color, -0.18));
      // (v21) the kaftan: its front edge, crossing over to the right, in a band of trim
      if (T.kaftan) chestPanel(0.025, 0.032, 0.455, 0.65, T.trim, fem ? 0.014 : 0.006, fem ? 0.012 : 0.006);
    } else if (T.item === 'surplice') {
      // the white surplice's yoke over the cassock
      box(chest, 0.09, 0.025, 0.006, 0, 0.65 - CH, frontAt(0.65) + 0.003, T.color);
    } else if (T.item === 'jerkin') {
      // (v9) a sleeveless leather jerkin over the shirt, closed, with a dark laced seam down the front
      if (fem) {
        const yt = BUST[0][0] + 0.004, [w0, d0] = torsoAt(0.4), [w1, d1] = torsoAt(yt);
        taper(chest, 0.4 - CH, yt - CH, [w0 + 0.014, d0 + 0.012], [w1 + 0.014, d1 + 0.012], T.color);
        chestPanel(0, B.sh - 0.05, yt - 0.006, 0.655, T.color, 0.006, 0.012);
        chestPanel(0, 0.012, 0.41, 0.65, shade(T.color, -0.4), 0.014, 0.006);
      } else {
        box(chest, B.sh + 0.012, 0.155, B.dep + 0.012, 0, 0.5975 - CH, 0, T.color);
        box(chest, B.wa + 0.012, 0.17, B.dep + 0.006, 0, 0.445 - CH, 0, T.color);
        chestPanel(0, 0.012, 0.37, 0.66, shade(T.color, -0.4), 0.008, 0.006);
      }
    } else if (T.item === 'gambeson') {
      // (v9) a quilted gambeson: darker stitched lines across front and back, and a padded collar
      for (const y of [0.44, 0.49, 0.54, 0.59, 0.635]) {
        const w = (fem ? torsoAt(y)[0] : y > 0.51 ? B.sh : B.wa) - 0.036;
        chestPanel(0, w, y, y + 0.008, shade(T.color, -0.28), 0.004, 0.006);
        box(chest, w * 0.9, 0.008, 0.006, 0, y + 0.004 - CH, -(frontAt(y) + 0.004), shade(T.color, -0.28));
      }
      box(chest, B.sh - 0.05, 0.03, B.dep + 0.016, 0, 0.662 - CH, 0, shade(T.color, 0.08));
    } else if (T.item === 'tunic' || T.item === 'shirt') {
      // a slit neck, laced
      box(chest, 0.03, 0.07, 0.006, 0, 0.625 - CH, frontAt(0.625) + 0.003, shade(T.color, -0.3));
    }
    if (d.belt) {
      // (v21: the desert's wide sash stands out over a skirt's or long tunic's top)
      const wide = d.belt.wide ? 0.03 : 0;
      const bw = (fem ? hipAt(0.4)[0] + 0.012 : B.wa + 0.022) + wide, bd = (fem ? hipAt(0.4)[1] + 0.02 : B.dep + 0.016) + wide;
      box(body, bw, d.belt.wide ? 0.07 : d.belt.sash ? 0.05 : 0.04, bd, 0, 0.42, 0, d.belt.color);
      if (d.belt.sash || d.belt.cord) box(body, d.belt.cord ? 0.02 : 0.04, d.belt.cord ? 0.18 : 0.12, 0.012, B.wa / 4, d.belt.cord ? 0.325 : 0.355, Math.max(bd / 2, skirtFront(0.36)) + 0.008, d.belt.color, skirtP ? -0.08 : 0);
      else if (d.belt.buckle) box(body, 0.04, 0.045, 0.012, 0, 0.42, bd / 2 + 0.006, '#c8a048');
    }
    // the apron: a panel that swings with the leg ahead, and maybe a bib on the chest; a smith's is long, leather and
    // always has its bib
    if (d.apron) {
      const A = d.apron, bottom = skirted ? hem + (A.heavy ? 0.03 : 0.06) : A.heavy ? 0.13 : 0.2;
      hangPanel(1, 0, B.hip - (A.heavy ? 0.05 : 0.08), B.hip - (A.heavy ? 0.03 : 0.04), bottom, A.color, A.heavy ? 0.016 : 0.012);
      const [aw, ad] = fem ? torsoAt(0.44) : [B.wa, B.dep];
      box(body, aw + 0.04, 0.02, Math.max(ad + 0.05, skirtP ? 2 * skirtFront(0.44) + 0.016 : 0), 0, 0.44, 0, shade(A.color, -0.15));
      if (A.bib) {
        chestPanel(0, B.wa - (A.heavy ? 0.05 : 0.065), 0.44, A.heavy ? 0.64 : 0.6, A.color, A.heavy ? 0.014 : 0.008);
        if (A.heavy) for (const sx of [1, -1]) box(chest, 0.018, 0.04, B.dep + 0.02, sx * 0.06, 0.66 - CH, 0, shade(A.color, -0.2));
      }
    }
    // the neck, and a shawl or neckerchief round it
    box(chest, 0.1, 0.06, 0.09, 0, 0.69 - CH, 0, skin);
    if (d.shawl) {
      box(chest, B.sh + 0.05, 0.06, B.dep + 0.05, 0, 0.66 - CH, 0, d.shawl.color);
      box(chest, 0.1, 0.1, 0.012, 0, 0.62 - CH, (fem ? bustFront(0.6) : B.dep / 2) + 0.007, d.shawl.color, 0, Math.PI / 4);
    }
    if (d.neckerchief) {
      box(chest, 0.14, 0.04, 0.12, 0, 0.67 - CH, 0.005, d.neckerchief.color);
      box(chest, 0.06, 0.06, 0.012, 0, 0.635 - CH, 0.065, d.neckerchief.color, 0, Math.PI / 4);
    }
    // a chain of office hung in a V from the shoulders, with a medallion
    if (d.chain) {
      for (const sx of [1, -1]) box(chest, 0.014, 0.12, 0.012, sx * 0.045, 0.615 - CH, chestFront(0.615) + 0.02, d.chain, 0, sx * 0.7);
      box(chest, 0.04, 0.04, 0.012, 0, 0.565 - CH, chestFront(0.565) + 0.023, d.chain, 0, Math.PI / 4);
    }
    // a stole: two bands of colour down the front from the neck to below the knee
    if (d.stole) for (const sx of [1, -1]) {
      chestPanel(sx * 0.05, 0.04, 0.42, 0.66, d.stole, 0.016, 0.01);
      hangPanel(1, sx * 0.05, 0.04, 0.045, skirted ? hem + 0.1 : 0.2, d.stole, 0.016);
    }
    // a cloak from the shoulders down the back, flaring to the calf, fastened at the collarbones
    if (d.cloak) {
      const back = y => (fem ? torsoAt(y)[1] : B.dep) / 2 + 0.02;
      taper(chest, 0.42 - CH, 0.67 - CH, [B.sh + 0.03, 0.016, 0, -back(0.42)], [B.sh + 0.05, 0.016, 0, -back(0.67)], d.cloak);
      box(chest, B.sh + 0.06, 0.03, B.dep + 0.084, 0, 0.665 - CH, 0, shade(d.cloak, -0.15));
      for (const sx of [1, -1]) box(chest, 0.03, 0.03, 0.012, sx * 0.075, 0.64 - CH, chestFront(0.64) + 0.025, '#c8a048');
      hangPanel(-1, 0, B.sh + 0.03, B.sh + 0.1, skirted ? hem + 0.02 : 0.14, d.cloak, 0.03);
    }
    // a satchel on the back, its strap over the left shoulder
    if (d.satchel) {
      box(chest, 0.022, 0.27, 0.01, 0.075, 0.53 - CH, -(frontAt(0.53) + 0.006), d.satchel);
      box(chest, 0.022, 0.012, B.dep + 0.02, 0.075, 0.675 - CH, 0, d.satchel);
      box(chest, 0.12, 0.1, 0.05, 0.075, 0.38 - CH, -(frontAt(0.45) + 0.03), d.satchel);
      box(chest, 0.128, 0.04, 0.058, 0.075, 0.415 - CH, -(frontAt(0.45) + 0.03), shade(d.satchel, -0.25));
    }
    // (v9) a fur mantle over the shoulders, ragged tufts hanging from its edge
    if (d.furs) {
      const dz = Math.max(B.dep / 2 + 0.047, chestFront(0.64) + 0.016);
      box(chest, B.sh + 0.08, 0.075, 2 * dz, 0, 0.66 - CH, 0, d.furs);
      for (let k = 0; k < 7; k++) {
        const x = (k - 3) / 3 * (B.sh / 2 + 0.02), long = k % 2 === 0;
        box(chest, 0.05, long ? 0.05 : 0.035, 2 * dz + (long ? 0.006 : -0.008), x, (long ? 0.6 : 0.612) - CH, 0, shade(d.furs, long ? -0.12 : 0.06));
      }
    }
    // a quiver on the back, arrows up over the right shoulder, its strap over that shoulder
    if (d.quiver) {
      const q = pivot(chest, -0.06, 0.5 - CH, -(frontAt(0.5) + 0.05)); q.rotation.z = 0.35;
      box(q, 0.07, 0.3, 0.07, 0, 0, 0, d.quiver);
      box(q, 0.078, 0.03, 0.078, 0, -0.13, 0, shade(d.quiver, -0.3));
      box(q, 0.078, 0.02, 0.078, 0, 0.13, 0, shade(d.quiver, -0.3));
      [[-0.016, -0.012, '#e8e2d4'], [0.016, 0.0, '#b8282a'], [0, 0.016, '#e8e2d4']].forEach(([x, z, c]) => {
        box(q, 0.008, 0.06, 0.008, x, 0.17, z, '#8a6440'); box(q, 0.004, 0.05, 0.022, x, 0.21, z, c);
      });
      box(chest, 0.022, 0.012, B.dep + 0.026, -0.075, 0.675 - CH, 0, d.quiver);
    }
    // a round shield slung on the back: an eight-sided board, a painted cross and an iron boss
    if (d.shield) {
      const sh = pivot(chest, 0, 0.5 - CH, -(frontAt(0.5) + 0.046));
      box(sh, 0.24, 0.24, 0.025, 0, 0, 0, d.shield.color);
      box(sh, 0.24, 0.24, 0.02, 0, 0, 0, shade(d.shield.color, -0.15), 0, Math.PI / 4);
      box(sh, 0.234, 0.05, 0.031, 0, 0, 0, d.shield.trim); box(sh, 0.05, 0.234, 0.031, 0, 0, 0, d.shield.trim);
      box(sh, 0.06, 0.06, 0.04, 0, 0, -0.008, '#6a6e78');
    }
    // a cult's sigil on the breast: a diamond with a dark eye
    if (d.sigil) {
      box(chest, 0.06, 0.06, 0.008, 0, 0.5 - CH, chestFront(0.5) + 0.014, d.sigil, 0, Math.PI / 4);
      box(chest, 0.028, 0.012, 0.008, 0, 0.5 - CH, chestFront(0.5) + 0.018, '#1a1214');
    }
    // a sword at the left hip, hilt forward
    if (d.sword) {
      const sw = pivot(body, (fem ? hipAt(0.36)[0] : B.hip) / 2 + 0.02, 0.38, 0.02); sw.rotation.x = 0.45;
      box(sw, 0.035, 0.36, 0.05, 0, -0.17, 0, '#3a2a1e');
      box(sw, 0.042, 0.03, 0.058, 0, -0.34, 0, '#c8a048');
      box(sw, 0.03, 0.02, 0.12, 0, 0.02, 0, '#c8a048');
      box(sw, 0.026, 0.09, 0.026, 0, 0.07, 0, '#4e3220');
    }
    // ---- the head (a neck pivot) ----
    const head = pivot(chest, 0, 0.7 - CH, 0);
    box(head, 0.19, 0.19, 0.18, 0, 0.1, 0, skin);
    for (const s of [1, -1]) {
      box(head, 0.035, 0.035, 0.01, s * 0.045, 0.11, 0.092, d.eyes);
      // brows in the hair's colour; lashes swept out on the feminine face
      // (v2, Jordan: tilted lashes read as angry brows) the feminine face: a flat lash line on the eye's top edge with a
      // small flick up at the outer corner, and a soft level brow higher up
      if (fem) {
        box(head, 0.042, 0.01, 0.012, s * 0.046, 0.131, 0.094, '#1e1612');
        box(head, 0.01, 0.012, 0.012, s * 0.07, 0.137, 0.094, '#1e1612');
        box(head, 0.042, 0.01, 0.01, s * 0.046, 0.158, 0.093, shade(d.hair, -0.1));
      }
      else box(head, 0.05, 0.014, 0.012, s * 0.045, 0.142, 0.094, shade(d.hair, -0.15));
    }
    if (fem) box(head, 0.04, 0.012, 0.008, 0, 0.05, 0.092, shade(skin, -0.28));
    if (d.age === 'old' && !d.warpaint) for (const s of [1, -1]) box(head, 0.02, 0.008, 0.006, s * 0.072, 0.1, 0.091, shade(skin, -0.15));
    // beards
    const bc = d.age === 'old' ? d.hair : shade(d.hair, -0.05);
    if (d.beard === 'full') {
      box(head, 0.17, 0.07, 0.035, 0, 0.035, 0.08, bc);
      // (the side whiskers' fronts stop short of the face's, v3: flush with it they z-fought)
      for (const s of [1, -1]) box(head, 0.025, 0.1, 0.11, s * 0.088, 0.06, 0.03, bc);
      box(head, 0.08, 0.02, 0.012, 0, 0.068, 0.096, bc);
    } else if (d.beard === 'moustache') box(head, 0.09, 0.022, 0.014, 0, 0.065, 0.095, bc);
    else if (d.beard === 'stubble') box(head, 0.176, 0.058, 0.03, 0, 0.036, 0.078, shade(skin, -0.18));
    // (v9) war paint across the eyes, a cloth over the nose and mouth, or a bone skull mask
    if (d.warpaint && !(d.mask && d.mask.kind === 'skull')) box(head, 0.196, 0.03, 0.004, 0, 0.11, 0.0915, d.warpaint);
    if (d.mask && d.mask.kind === 'cloth') {
      // (v10, Jordan: a bandit's kerchief, not a physician's mask) one angled cloth from the bridge of the nose down to a
      // point below the chin, standing off the face over any beard; tied round the head, its knot's ends hanging behind
      const MC = d.mask.color;
      loft(head, [[-0.046, 0.008, 0.01, 0, 0.12], [0.03, 0.17, 0.014, 0, 0.114], [0.091, 0.206, 0.014, 0, 0.108]], MC);
      box(head, 0.21, 0.022, 0.18, 0, 0.08, 0.008, shade(MC, -0.08));
      box(head, 0.04, 0.032, 0.03, 0, 0.08, -0.1, shade(MC, -0.2));
      for (const s of [1, -1]) taper(head, -0.005, 0.068, [0.006, 0.008, s * 0.03, -0.11], [0.028, 0.01, s * 0.008, -0.107], shade(MC, -0.12));
    } else if (d.mask) {
      // (v12, Jordan: an animal skull, kept simple) a stag's skull worn over the face: one long tapered face from a wide
      // brow down to a narrow muzzle below the chin, leaning out at the bottom; two dark sockets high at the sides, two
      // nostril slits at the muzzle, and antlers out through the hood, each a beam with two tines
      const M = d.mask.color, HOLE = '#120c0e', ANTLER = shade(M, -0.2);
      taper(head, -0.075, 0.175, [0.05, 0.03, 0, 0.13], [0.2, 0.026, 0, 0.1], M);
      for (const s of [1, -1]) {
        box(head, 0.044, 0.03, 0.008, s * 0.062, 0.125, 0.1196, HOLE, 0, s * 0.35);
        if (d.head.glow) box(head, 0.014, 0.01, 0.004, s * 0.062, 0.123, 0.1256, d.head.glow);
        box(head, 0.008, 0.04, 0.006, s * 0.011, -0.035, 0.142, HOLE, 0, -s * 0.12);
        const a = pivot(head, s * 0.07, 0.205, 0.035); a.rotation.z = -s * 0.75;
        taper(a, 0, 0.22, [0.032, 0.032], [0.012, 0.012, 0, -0.03], ANTLER);
        const t1 = pivot(a, 0, 0.08, -0.008); t1.rotation.z = s * 0.95;
        taper(t1, 0, 0.1, [0.02, 0.02], [0.008, 0.008], ANTLER);
        const t2 = pivot(a, 0, 0.15, -0.018); t2.rotation.z = s * 0.7;
        taper(t2, 0, 0.08, [0.016, 0.016], [0.006, 0.006], ANTLER);
      }
    }
    // hair, then whatever's on the head over it
    const hat = d.head.item, covered = hat !== 'none' && hat !== 'skullcap', hood = hat === 'hood' || hat === 'coif' || hat === 'cultHood' || hat === 'headscarf';
    const wrapped = hat === 'hood' || hat === 'cultHood' || hat === 'headscarf';   // (hair tied up at the back is hidden too)
    const hc = d.hair, hs = d.hairStyle;
    const top = (h = 0.06) => { if (!covered) box(head, 0.2, h, 0.196, 0, 0.185 + h / 2, -0.002, hc); };
    const back = (h = 0.15, y = 0.13) => { if (!hood) box(head, 0.2, h, 0.05, 0, y, -0.08, hc); };
    const fringe = () => { if (!covered) box(head, 0.19, 0.03, 0.02, 0, 0.183, 0.095, hc); };
    if (hs === 'short') { top(); back(); }
    else if (hs === 'crop') { top(0.03); back(0.1, 0.15); }
    else if (hs === 'bald') { if (!hood) { box(head, 0.2, 0.05, 0.11, 0, 0.12, -0.035, hc); back(0.06, 0.12); } }
    else if (hs === 'shaggy') {
      top(0.07); back(0.2, 0.1); fringe();
      if (!hood) for (const s of [1, -1]) box(head, 0.03, 0.1, 0.12, s * 0.1, 0.14, -0.02, hc);
    } else if (hs === 'long') {
      top(); back(0.32, 0.04); fringe();
      if (!hood) for (const s of [1, -1]) box(head, 0.035, 0.2, 0.05, s * 0.1, 0.08, 0.03, hc);
    } else if (hs === 'bob') {
      top(); back(0.17, 0.1); fringe();
      if (!hood) for (const s of [1, -1]) box(head, 0.03, 0.15, 0.15, s * 0.1, 0.11, -0.01, hc);
    } else if (hs === 'bun') {
      top(); back(0.13, 0.14);
      if (!wrapped && hat !== 'strawHat' && hat !== 'turban') box(head, 0.1, 0.09, 0.08, 0, hat === 'none' ? 0.2 : 0.17, -0.12, hc);
    } else if (hs === 'braid') {
      top(); back(0.15, 0.13); fringe();
      if (!wrapped) { box(head, 0.045, 0.03, 0.04, 0, 0.07, -0.115, shade(hc, -0.25)); for (let k = 0; k < 3; k++) box(head, 0.05 - k * 0.004, 0.055, 0.045, 0, 0.035 - k * 0.06, -0.115 - k * 0.006, hc, -0.08); }
    } else if (hs === 'ponytail') {
      top(); back(0.13, 0.14);
      if (!wrapped) { box(head, 0.05, 0.03, 0.04, 0, 0.13, -0.11, shade(hc, -0.25)); box(head, 0.06, 0.18, 0.05, 0, 0.03, -0.125, hc, -0.12); }
    }
    const H = d.head;
    if (hat === 'hood') {
      // a cloth hood: crown, back and sides round the face, a point at the back, and a capelet over the shoulders
      box(head, 0.225, 0.05, 0.215, 0, 0.215, -0.008, H.color);
      box(head, 0.225, 0.22, 0.05, 0, 0.1, -0.095, H.color);
      for (const s of [1, -1]) box(head, 0.03, 0.2, 0.2, s * 0.11, 0.11, -0.005, H.color);
      box(head, 0.07, 0.06, 0.07, 0, 0.21, -0.12, shade(H.color, -0.1), 0.5);
      box(chest, B.sh + 0.05, 0.07, B.dep + 0.062, 0, 0.665 - CH, -0.008, H.color);
      box(chest, B.sh - 0.02, 0.05, B.dep + 0.03, 0, 0.62 - CH, -0.005, shade(H.color, -0.15));
    } else if (hat === 'cap') {
      // a soft cloth cap with a short peak
      box(head, 0.212, 0.055, 0.206, 0, 0.225, -0.008, H.color);
      box(head, 0.18, 0.06, 0.18, 0, 0.255, -0.014, shade(H.color, 0.06));
      box(head, 0.17, 0.014, 0.06, 0, 0.2, 0.11, shade(H.color, -0.3));
    } else if (hat === 'strawHat') {
      box(head, 0.36, 0.018, 0.36, 0, 0.205, 0, H.color);
      box(head, 0.352, 0.006, 0.352, 0, 0.196, 0, STRAW_DARK);
      box(head, 0.19, 0.09, 0.19, 0, 0.255, 0, H.color);
      box(head, 0.196, 0.026, 0.196, 0, 0.226, 0, H.band);
    } else if (hat === 'kerchief') {
      // a headscarf tied at the back of the neck, its ends hanging
      box(head, 0.21, 0.045, 0.205, 0, 0.215, -0.006, H.color);
      box(head, 0.21, 0.11, 0.045, 0, 0.16, -0.088, H.color);
      box(head, 0.06, 0.05, 0.04, 0, 0.1, -0.119, shade(H.color, -0.15), 0, Math.PI / 4);
      for (const s of [1, -1]) box(head, 0.03, 0.08, 0.012, s * 0.02, 0.05, -0.12, H.color, 0, s * 0.25);
      for (const s of [1, -1]) box(head, 0.03, 0.06, 0.16, s * 0.102, 0.17, -0.02, H.color);
    } else if (hat === 'coif') {
      // a close linen cap over the ears, tied under the chin
      box(head, 0.21, 0.05, 0.205, 0, 0.215, -0.006, H.color);
      box(head, 0.21, 0.17, 0.045, 0, 0.12, -0.088, H.color);
      for (const s of [1, -1]) box(head, 0.025, 0.15, 0.16, s * 0.103, 0.13, -0.006, H.color);
      box(head, 0.2, 0.025, 0.02, 0, 0.19, 0.09, shade(H.color, -0.1));
    } else if (hat === 'featherCap') {
      // a soft cap with an upturned brim and a long feather swept back
      box(head, 0.214, 0.05, 0.208, 0, 0.222, -0.006, H.color);
      box(head, 0.19, 0.05, 0.19, 0.01, 0.255, -0.01, shade(H.color, 0.05), 0, -0.08);
      box(head, 0.23, 0.03, 0.06, 0, 0.215, 0.085, shade(H.color, -0.25), -0.3);
      box(head, 0.025, 0.012, 0.24, 0.1, 0.29, -0.06, H.feather, 0.45, -0.25);
      box(head, 0.04, 0.008, 0.16, 0.1, 0.29, -0.06, H.feather, 0.45, -0.25);
    } else if (hat === 'beret') {
      box(head, 0.214, 0.035, 0.208, 0, 0.215, -0.006, shade(H.color, -0.2));
      box(head, 0.26, 0.04, 0.24, 0.02, 0.245, -0.01, H.color, 0, -0.12);
    } else if (hat === 'tallHat') {
      // a tall hat, wider at the crown, with a band and a broad brim
      box(head, 0.3, 0.016, 0.28, 0, 0.205, 0, H.color);
      taper(head, 0.21, 0.37, [0.19, 0.18], [0.21, 0.2], H.color);
      box(head, 0.196, 0.03, 0.186, 0, 0.23, 0, H.trim || shade(H.color, 0.25));
    } else if (hat === 'crierHat') {
      // a cocked hat: a crown, its brim turned up in three sides, with a trim edge
      box(head, 0.19, 0.08, 0.19, 0, 0.245, 0, H.color);
      box(head, 0.3, 0.014, 0.3, 0, 0.2, 0, H.color, 0, 0, Math.PI / 4);
      for (const a of [0, 2.1, -2.1]) {
        const sx = Math.sin(a), sz = Math.cos(a);
        box(head, 0.22, 0.07, 0.014, sx * 0.12, 0.24, sz * 0.12, H.color, 0, 0, a);
        box(head, 0.226, 0.012, 0.022, sx * 0.12, 0.275, sz * 0.12, H.trim || '#c8a048', 0, 0, a);
      }
    } else if (hat === 'kettleHat') {
      // an iron kettle hat: a round-ish crown and a wide sloped brim
      taper(head, 0.2, 0.31, [0.215, 0.215], [0.14, 0.14], H.color);
      taper(head, 0.17, 0.2, [0.34, 0.34], [0.23, 0.23], shade(H.color, -0.15));
      box(head, 0.03, 0.03, 0.03, 0, 0.32, 0, shade(H.color, -0.3));
    } else if (hat === 'mitre') {
      // a bishop's mitre: tall, narrowing to a point front and back, gold bands, lappets down the back
      taper(head, 0.2, 0.44, [0.2, 0.17], [0.05, 0.11], H.color);
      box(head, 0.205, 0.035, 0.176, 0, 0.215, 0, H.trim || '#c8a048');
      // (bands and lappets stand clear of the mitre's faces and of the hair at the back: flush they z-fought)
      for (const sz of [1, -1]) taper(head, 0.23, 0.42, [0.035, 0.006, 0, sz * 0.089], [0.02, 0.006, 0, sz * 0.059], H.trim || '#c8a048');
      for (const sx of [1, -1]) box(head, 0.03, 0.18, 0.008, sx * 0.05, 0.1, -0.114, H.trim || '#c8a048');
    } else if (hat === 'cultHood') {
      // (v9) a cult's deep hood: the plain hood's crown, back and sides, a tall point leaning back, a brim drooping over
      // a face lost in shadow (eyes glowing out of it, unless a mask is worn), and a long capelet
      box(head, 0.225, 0.05, 0.215, 0, 0.215, -0.008, H.color);
      box(head, 0.225, 0.22, 0.05, 0, 0.1, -0.095, H.color);
      for (const s of [1, -1]) box(head, 0.03, 0.22, 0.2, s * 0.11, 0.1, -0.005, H.color);
      taper(head, 0.235, 0.37, [0.17, 0.15, 0, -0.03], [0.02, 0.02, 0, -0.12], H.color);
      box(head, 0.234, 0.03, 0.04, 0, 0.203, 0.105, shade(H.color, -0.15));
      if (!d.mask) {
        box(head, 0.19, 0.12, 0.008, 0, 0.13, 0.101, '#0c0a0c');
        if (H.glow) for (const s of [1, -1]) box(head, 0.026, 0.012, 0.004, s * 0.045, 0.115, 0.107, H.glow);
      }
      box(chest, B.sh + 0.05, 0.1, B.dep + 0.062, 0, 0.65 - CH, -0.008, H.color);
      box(chest, B.sh - 0.02, 0.05, B.dep + 0.03, 0, 0.6 - CH, -0.005, shade(H.color, -0.15));
    } else if (hat === 'nasalHelm') {
      // (v9) an iron helm: a domed cap, a riveted rim and a bar down the nose
      taper(head, 0.2, 0.3, [0.205, 0.2], [0.1, 0.1], H.color);
      box(head, 0.214, 0.026, 0.216, 0, 0.2, 0, shade(H.color, -0.2));
      box(head, 0.022, 0.085, 0.012, 0, 0.145, 0.108, shade(H.color, -0.1));
    } else if (hat === 'slouchHat') {
      // (v9) a wide-brimmed slouch hat, the brim drooping at the front, a band round the crown
      box(head, 0.2, 0.08, 0.2, 0, 0.245, 0, H.color);
      box(head, 0.34, 0.014, 0.3, 0, 0.205, -0.02, H.color);
      box(head, 0.3, 0.014, 0.09, 0, 0.19, 0.16, shade(H.color, -0.08), 0.3);
      box(head, 0.206, 0.024, 0.206, 0, 0.222, 0, H.trim || shade(H.color, -0.35));
    } else if (hat === 'skullcap') {
      box(head, 0.14, 0.03, 0.13, 0, 0.255, -0.02, H.color);
    } else if (hat === 'turban') {
      // (v21) a turban: a wrap round the brow, a second laid over it at a slant, the crown and a dome on top, a fold
      // crossing the front, and the end tucked in hanging at the back
      box(head, 0.236, 0.07, 0.232, 0, 0.225, -0.006, H.color);
      box(head, 0.244, 0.06, 0.238, 0, 0.268, -0.012, shade(H.color, -0.06), -0.1);
      box(head, 0.2, 0.06, 0.196, 0, 0.3, -0.014, shade(H.color, 0.05));
      box(head, 0.13, 0.03, 0.126, 0, 0.336, -0.014, H.color);
      box(head, 0.19, 0.03, 0.02, 0, 0.25, 0.115, shade(H.color, -0.14), 0, 0.38);
      box(head, 0.05, 0.13, 0.016, 0.035, 0.15, -0.13, shade(H.color, -0.04));
    } else if (hat === 'taqiyah') {
      // (v21) a round cap, a little wider than the head, a darker band at its rim
      box(head, 0.222, 0.08, 0.218, 0, 0.24, -0.006, H.color);
      box(head, 0.19, 0.025, 0.186, 0, 0.29, -0.006, shade(H.color, 0.06));
      box(head, 0.23, 0.018, 0.226, 0, 0.205, -0.006, shade(H.color, -0.25));
    } else if (hat === 'headscarf') {
      // (v21) a headscarf: over the crown and down the back and the sides of the face, wrapped round the neck and
      // falling over the shoulders, its edge framing the face
      box(head, 0.226, 0.05, 0.218, 0, 0.217, -0.006, H.color);
      box(head, 0.226, 0.26, 0.05, 0, 0.09, -0.097, H.color);
      for (const s of [1, -1]) box(head, 0.03, 0.22, 0.19, s * 0.113, 0.11, -0.01, H.color);
      box(head, 0.232, 0.022, 0.024, 0, 0.198, 0.096, H.trim || shade(H.color, -0.2));
      box(chest, 0.17, 0.08, 0.15, 0, 0.695 - CH, 0, H.color);
      box(chest, B.sh + 0.05, 0.06, B.dep + 0.06, 0, 0.655 - CH, -0.006, H.color);
      box(chest, B.sh - 0.02, 0.05, B.dep + 0.03, 0, 0.61 - CH, -0.004, shade(H.color, -0.12));
    }
    // ---- arms: shoulder, elbow, wrist ----
    const armL = pivot(chest, B.shoulder, 0.64 - CH, 0), armR = pivot(chest, -B.shoulder, 0.64 - CH, 0), ELBOW = -0.1, WRIST = -0.2;
    armL.rotation.order = armR.rotation.order = 'YXZ';
    const elbows = [], wrists = [];
    const shortSleeve = T.item === 'shortSleeve';
    const sleeve = overUnder ? upper : T.color, wide = ['robe', 'surplice', 'gown'].includes(T.item);
    for (const arm of [armL, armR]) {
      box(arm, B.arm, -ELBOW + 0.02, B.arm + 0.01, 0, ELBOW / 2 + 0.01, 0, sleeve);
      const fore = pivot(arm, 0, ELBOW, 0); elbows.push(fore);
      box(fore, B.arm - 0.004, 0.11, B.arm + 0.006, 0, -0.045, 0, shortSleeve ? skin : sleeve);
      // a turned-back cuff on long sleeves
      if (wide) box(fore, B.arm + 0.03, 0.05, B.arm + 0.035, 0, -0.08, 0, T.item === 'gown' ? T.trim : sleeve);
      else if (!shortSleeve) box(fore, B.arm + 0.004, 0.025, B.arm + 0.014, 0, -0.088, 0, T.item === 'dress' ? T.trim : shade(sleeve, -0.12));
      // a doublet's or gown's puffed shoulder
      if (T.item === 'doublet' || T.item === 'gown') box(arm, B.arm + 0.03, 0.07, B.arm + 0.03, 0, -0.02, 0, T.trim);
      const hand = pivot(fore, 0, WRIST - ELBOW, 0); wrists.push(hand);
      hand.rotation.order = 'XZY';
      box(hand, B.arm - 0.01, 0.065, 0.07, 0, -0.033, 0, skin);
      if (d.gloves) { box(hand, B.arm - 0.002, 0.07, 0.076, 0, -0.033, 0, d.gloves); box(fore, B.arm + 0.012, 0.05, B.arm + 0.02, 0, -0.081, 0, shade(d.gloves, 0.1)); }
    }
    // ---- props (shown by the poses that use them) ----
    // a broom for the sweep, hung from the body: the pose lays its handle through both hands each frame (local -y
    // runs down the handle to the brush, whose bottom is at y -0.75)
    const broom = pivot(body, 0, 0, 0); broom.rotation.order = 'YXZ';
    box(broom, 0.026, 0.95, 0.026, 0, -0.15, 0, '#8a6440');
    box(broom, 0.07, 0.035, 0.05, 0, -0.6, 0, '#5a3a22');
    box(broom, 0.16, 0.14, 0.05, 0, -0.68, 0, STRAW);
    box(broom, 0.17, 0.02, 0.055, 0, -0.64, 0, STRAW_DARK);
    // a crate carried in both arms
    const crate = pivot(chest, 0, 0.47 - CH, 0.21);
    box(crate, 0.3, 0.22, 0.24, 0, 0, 0, '#9a6a3e');
    for (const y of [-0.08, 0.08]) box(crate, 0.31, 0.04, 0.25, 0, y, 0, '#6a4426');
    for (const s of [1, -1]) box(crate, 0.04, 0.23, 0.25, s * 0.13, 0, 0, '#5a3a22');
    broom.visible = crate.visible = false;
    // (v7) the job's tool, in the left hand (a frame hanging with the hand: -y down, +z ahead). Staffs are kept upright
    // by the pose; a lute rides on the back. (v14) The hostile folk hold their weapons in the right hand as the hero
    // does (a bow or crossbow stays in the left, as the hero's bow does), so the game can give them the hero's strokes.
    const hand = d.hostile && !['shortbow', 'crossbow'].includes(d.prop) ? 1 : 0;
    const tool = pivot(wrists[hand], 0, -0.045, 0.0);
    const WOOD = '#8a6440', DARK = '#4e3220', STEEL = '#b8bec8', GOLD = '#c8a048', WICKER = '#a8844e';
    const basket = fill => {
      box(tool, 0.16, 0.09, 0.12, 0, -0.14, 0.03, WICKER);
      box(tool, 0.166, 0.02, 0.126, 0, -0.1, 0.03, shade(WICKER, -0.25));
      for (const sx of [1, -1]) box(tool, 0.012, 0.1, 0.012, sx * 0.07, -0.05, 0.03, shade(WICKER, -0.2));
      box(tool, 0.152, 0.012, 0.02, 0, 0.0, 0.03, shade(WICKER, -0.2));
      fill();
    };
    const P = d.prop;
    if (P === 'torch') {
      // (v9, kept upright like a staff) a pitch torch, burning
      box(tool, 0.035, 0.42, 0.035, 0, 0.1, 0, WOOD);
      box(tool, 0.05, 0.07, 0.05, 0, 0.3, 0, '#4a3a2e');
      box(tool, 0.06, 0.09, 0.06, 0, 0.375, 0, '#ff8a2a');
      box(tool, 0.034, 0.08, 0.034, 0, 0.44, 0, '#ffd24a');
    } else if (P === 'shovel') {
      box(tool, 0.03, 1.0, 0.03, 0, 0.12, 0, WOOD);
      box(tool, 0.09, 0.025, 0.04, 0, 0.62, 0, DARK);
      taper(tool, -0.56, -0.37, [0.1, 0.014], [0.13, 0.018], '#6a6e78');
    } else if (P === 'cultStaff') {
      box(tool, 0.03, 1.25, 0.03, 0, 0.23, 0, '#2a2226');
      box(tool, 0.08, 0.075, 0.085, 0, 0.9, 0, '#d8ceb0');
      box(tool, 0.06, 0.03, 0.06, 0, 0.85, 0.008, '#c4b898');
      for (const s of [1, -1]) {
        box(tool, 0.022, 0.02, 0.008, s * 0.018, 0.905, 0.044, '#1a1010');
        box(tool, 0.015, 0.07, 0.015, s * 0.045, 0.95, 0, '#3a3030', 0, -s * 0.4);
      }
    } else if (P === 'club') {
      box(tool, 0.03, 0.14, 0.03, 0, -0.03, 0.027, DARK);
      taper(tool, -0.3, -0.08, [0.075, 0.075, 0, 0.02], [0.045, 0.045, 0, 0.02], '#7a5a3a');
      for (const [x, y, z] of [[0.04, -0.24, 0.02], [-0.04, -0.2, 0.02], [0, -0.26, 0.062]]) box(tool, 0.016, 0.016, 0.016, x, y, z, '#6a6e78');
    } else if (P === 'dagger' || P === 'ritualKnife') {
      const rit = P === 'ritualKnife';
      box(tool, 0.024, 0.07, 0.024, 0, 0.0, 0.02, rit ? '#5a1418' : DARK);
      box(tool, 0.034, 0.022, 0.034, 0, 0.05, 0.022, rit ? GOLD : STEEL);
      box(tool, 0.07, 0.014, 0.028, 0, -0.042, 0.02, rit ? GOLD : STEEL);
      taper(tool, -0.19, -0.049, [0.006, 0.006, 0, 0.02], [0.026, 0.008, 0, 0.02], rit ? '#2a2430' : STEEL);
    } else if (P === 'swordDrawn') {
      box(tool, 0.026, 0.09, 0.026, 0, 0.0, 0.02, DARK);
      box(tool, 0.036, 0.026, 0.036, 0, 0.056, 0.02, STEEL);
      box(tool, 0.12, 0.02, 0.032, 0, -0.054, 0.02, STEEL);
      box(tool, 0.036, 0.38, 0.012, 0, -0.254, 0.02, STEEL);
      taper(tool, -0.5, -0.444, [0.004, 0.004, 0, 0.02], [0.036, 0.012, 0, 0.02], STEEL);
    } else if (P === 'sickle') {
      box(tool, 0.026, 0.11, 0.026, 0, -0.02, 0.02, WOOD);
      box(tool, 0.012, 0.07, 0.018, 0, -0.1, 0.035, '#9aa0a8', -0.35);
      box(tool, 0.012, 0.07, 0.018, 0, -0.148, 0.07, '#9aa0a8', -1.05);
      box(tool, 0.012, 0.06, 0.018, 0, -0.16, 0.122, '#9aa0a8', -1.8);
    } else if (P === 'shortbow') {
      // held at the grip, the limbs bending back at the tips, the string between them
      box(tool, 0.03, 0.08, 0.03, 0, 0, 0.042, DARK);
      taper(tool, 0.03, 0.3, [0.022, 0.022, 0, 0.05], [0.012, 0.012, 0, 0.012], '#8a6440');
      taper(tool, -0.3, -0.03, [0.012, 0.012, 0, 0.012], [0.022, 0.022, 0, 0.05], '#8a6440');
      box(tool, 0.004, 0.58, 0.004, 0, 0, 0.01, '#e8e2d4');
    } else if (P === 'crossbow') {
      box(tool, 0.04, 0.04, 0.32, 0, -0.03, 0.1, WOOD);
      box(tool, 0.34, 0.026, 0.03, 0, -0.012, 0.23, DARK);
      box(tool, 0.3, 0.006, 0.006, 0, -0.012, 0.2, '#e8e2d4');
      box(tool, 0.012, 0.012, 0.2, 0, -0.005, 0.15, '#6a4a2a');
    } else if (['staff', 'lampPole', 'crozier', 'spear', 'broomHeld'].includes(P)) {
      box(tool, 0.03, 1.25, 0.03, 0, 0.23, 0, P === 'crozier' ? GOLD : P === 'spear' ? DARK : WOOD);
      if (P === 'staff') box(tool, 0.05, 0.06, 0.05, 0, 0.85, 0, DARK);
      if (P === 'lampPole') {
        box(tool, 0.16, 0.025, 0.025, 0.06, 0.84, 0, DARK);
        box(tool, 0.006, 0.06, 0.006, 0.13, 0.8, 0, DARK);
        box(tool, 0.07, 0.09, 0.07, 0.13, 0.73, 0, '#ffd27a');
        box(tool, 0.08, 0.02, 0.08, 0.13, 0.785, 0, DARK);
      }
      if (P === 'crozier') { box(tool, 0.03, 0.03, 0.12, 0, 0.87, 0.045, GOLD); box(tool, 0.03, 0.09, 0.03, 0, 0.83, 0.1, GOLD); box(tool, 0.04, 0.04, 0.04, 0, 0.84, 0, '#e0e0f0'); }
      if (P === 'spear') { taper(tool, 0.85, 1.0, [0.05, 0.016], [0.004, 0.004], STEEL); box(tool, 0.04, 0.03, 0.04, 0, 0.845, 0, STEEL); }
      if (P === 'broomHeld') { box(tool, 0.07, 0.035, 0.05, 0, -0.37, 0, DARK); box(tool, 0.16, 0.14, 0.05, 0, -0.45, 0, STRAW); }
    } else if (P === 'hammer' || P === 'mallet') {
      box(tool, 0.025, 0.26, 0.025, 0, -0.1, 0.02, WOOD);
      box(tool, P === 'mallet' ? 0.07 : 0.05, P === 'mallet' ? 0.07 : 0.05, P === 'mallet' ? 0.12 : 0.11, 0, -0.23, 0.03, P === 'mallet' ? '#a07a50' : '#6a6e78');
    } else if (P === 'axe') {
      box(tool, 0.026, 0.34, 0.026, 0, -0.12, 0.02, WOOD);
      box(tool, 0.016, 0.1, 0.1, 0, -0.26, 0.07, STEEL);
      box(tool, 0.034, 0.05, 0.044, 0, -0.26, 0.02, '#6a6e78');
    } else if (P === 'scraper') {
      box(tool, 0.03, 0.08, 0.03, 0, -0.03, 0, WOOD);
      box(tool, 0.12, 0.012, 0.03, 0, -0.08, 0, STEEL);
    } else if (P === 'bell') {
      box(tool, 0.025, 0.08, 0.025, 0, -0.03, 0, DARK);
      taper(tool, -0.18, -0.07, [0.1, 0.1], [0.045, 0.045], GOLD);
    } else if (P === 'book' || P === 'ledger') {
      box(tool, 0.045, 0.17, 0.13, 0.0, -0.06, 0.036, P === 'ledger' ? '#3a2a22' : '#5a1e22');
      box(tool, 0.033, 0.16, 0.12, 0.003, -0.06, 0.036, '#ece2c8');
      if (P === 'book') box(tool, 0.052, 0.03, 0.03, 0, -0.06, 0.036, GOLD);
    } else if (P === 'scroll') {
      box(tool, 0.045, 0.045, 0.24, 0, -0.03, 0.04, '#e8dcb8');
      for (const sz of [1, -1]) box(tool, 0.05, 0.05, 0.02, 0, -0.03, 0.04 + sz * 0.125, DARK);
    } else if (P === 'mug') {
      // (held by the rim: the froth sits under the fingers, not inside them, where it z-fought the hand)
      box(tool, 0.06, 0.08, 0.06, 0, -0.07, 0.03, '#8e949e');
      box(tool, 0.068, 0.014, 0.068, 0, -0.03, 0.03, '#f0e8d0');
    } else if (P === 'purse') {
      box(tool, 0.076, 0.08, 0.05, 0, -0.08, 0.01, '#6a2a3a');
      box(tool, 0.05, 0.015, 0.035, 0, -0.035, 0.01, GOLD);
    } else if (P === 'ingot') {
      box(tool, 0.05, 0.04, 0.14, 0, -0.03, 0.03, '#7a7e88');
    } else if (P === 'pane') {
      box(tool, 0.012, 0.2, 0.24, -0.01, -0.06, 0.04, '#a8d0dc');
      box(tool, 0.02, 0.21, 0.02, -0.01, -0.06, 0.16, DARK);
    } else if (P === 'whip') {
      box(tool, 0.025, 0.2, 0.025, 0, -0.06, 0.02, DARK);
      box(tool, 0.008, 0.008, 0.3, 0, 0.04, -0.1, '#3a2a1e', 0.6);
    } else if (P === 'breadBasket') basket(() => { for (const sx of [-0.04, 0.035]) box(tool, 0.07, 0.04, 0.1, sx, -0.08, 0.03, '#b8783a'); });
    else if (P === 'herbBasket') basket(() => { for (const [sx, sz] of [[-0.04, 0], [0.03, 0.05], [0.04, -0.02]]) box(tool, 0.05, 0.06, 0.05, sx, -0.07, 0.03 + sz, '#4a7a34'); });
    else if (P === 'flowerBasket') basket(() => {
      [['#d84a5a', -0.05, 0.0], ['#f0d04a', 0.0, 0.05], ['#9a6ad8', 0.05, 0.0], ['#f0f0f0', -0.02, -0.03], ['#e88a3a', 0.04, 0.06]].forEach(([c, sx, sz]) => box(tool, 0.035, 0.035, 0.035, sx, -0.075, 0.03 + sz, c));
    });
    if (P === 'lute') {
      // on the back, slung across, neck up over the right shoulder
      var lute = pivot(chest, 0, 0.53 - CH, -(frontAt(0.53) + 0.04)); lute.rotation.z = 0.6;
      // (played: held across the front, the body at the right of the belly, the neck up to the left)
      var luteBack = [0, 0.53 - CH, -(frontAt(0.53) + 0.04)], luteFront = [-0.03, 0.5 - CH, frontAt(0.5) + 0.06];
      box(lute, 0.17, 0.2, 0.06, 0, -0.04, 0, '#a8703a');
      box(lute, 0.14, 0.06, 0.06, 0, 0.08, 0, '#a8703a');
      box(lute, 0.04, 0.04, 0.008, 0, -0.02, -0.032, '#3a2416');
      box(lute, 0.035, 0.24, 0.025, 0, 0.22, 0, '#5a3a22');
      box(lute, 0.05, 0.06, 0.03, 0, 0.36, 0, '#3a2416', -0.4);
    }
    const staff = ['staff', 'lampPole', 'crozier', 'spear', 'broomHeld', 'torch', 'shovel', 'cultStaff'].includes(P);
    // a soft round shadow on the ground
    const shadow = new GFX.Mesh(shadowGeo, shadowMat); shadow.position.y = 0.004; g.add(shadow);
    g.scale.set(1.12 * d.build * (fem ? 0.98 : 1), 1.12 * d.height * (fem ? 0.97 : 1), 1.12 * d.build);
    return { g, parts, d, body, chest, head, legL, legR, knees, ankles, armL, armR, elbows, wrists, flaps, fronts, backs, broom, crate, tool, hand, staff, shadow, lute, luteBack, luteFront };
  }
  return { design, build, pose, describe };
}

// ---------- the poses ----------
// The walk is the hero's (legSwing's planted half linear, knees bending on the swing, the foot kept level), a little
// slower and shorter in the step; the rest are made for standing about in town.
export const FOLK_WALK = { rate: 4.2, stride: 0.6, arms: 0.45, knee: 1.4, foot: 0.6, elbow: 0.3, bob: 0.025, twist: 0.08 };
export const ANIMS = ['idle', 'walk', 'talk', 'wave', 'carry', 'sweep', 'play', 'brandish'];
function legSwing(ph) {
  const u = ((ph % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), sn = Math.sin(u);
  const w = u > 1.5 * Math.PI ? u - 2 * Math.PI : u;
  return w <= Math.PI / 2 ? w / (Math.PI / 2) : sn;
}
// ---- two-handed grips (the sweep's broom) ----
// shoulder to elbow, and elbow to the middle of the grip (forearm 0.1 plus the hand's centre 0.033)
const ARM_A = 0.1, ARM_B = 0.133;
const LUTE_TILT = 1.13;   // (the played lute's neck: tipped this far from upright toward the left hand)
const rotX = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const rotZ = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
// turn an arm (order YXZ, y left at 0) and its elbow so the hand's grip comes to a point in the chest's frame, as near
// as the arm reaches; returns where the grip ends up
function reach(arm, elbow, target) {
  const S = arm.position, v = [target[0] - S.x, target[1] - S.y, target[2] - S.z];
  const d = Math.min(Math.max(Math.hypot(...v), ARM_B - ARM_A + 0.01), ARM_A + ARM_B - 0.002);
  const el = -Math.acos(Math.max(-1, Math.min(1, (d * d - ARM_A * ARM_A - ARM_B * ARM_B) / (2 * ARM_A * ARM_B))));
  const py = -ARM_A - ARM_B * Math.cos(el), pz = -ARM_B * Math.sin(el);
  const az = Math.asin(Math.max(-1, Math.min(1, v[0] / -py)));
  const ax = Math.atan2(v[2], v[1]) - Math.atan2(pz, py * Math.cos(az));
  arm.rotation.set(ax, 0, az); elbow.rotation.x = el;
  const p = rotX(rotZ([0, py, pz], az), ax);
  return [p[0] + S.x, p[1] + S.y, p[2] + S.z];
}
// lay the broom (a child of the body) along the line from the top grip through the low one, brush on the ground
function holdBroom(f, top, low, bodyY) {
  const c = f.chest, toBody = p => { const q = rotX(rotY(rotZ(p, c.rotation.z), c.rotation.y), c.rotation.x); return [q[0] + c.position.x, q[1] + c.position.y, q[2] + c.position.z]; };
  const T = toBody(top), L = toBody(low);
  let dir = [L[0] - T[0], L[1] - T[1], L[2] - T[2]];
  const n = Math.hypot(...dir) || 1; dir = dir.map(v => v / n);
  if (dir[1] > -0.3) dir[1] = -0.3;                    // (never flatter than that, so the brush finds the ground)
  const m = Math.hypot(...dir); dir = dir.map(v => v / m);
  const run = (L[1] + bodyY) / -dir[1];                // from the low hand down to the ground, along the handle
  const k = run - 0.75;
  f.broom.position.set(L[0] + dir[0] * k, L[1] + dir[1] * k, L[2] + dir[2] * k);
  f.broom.rotation.set(Math.acos(Math.max(-1, Math.min(1, -dir[1]))), Math.atan2(-dir[0], -dir[2]), 0);
}
export function pose(f, anim, t) {
  const W = FOLK_WALK, z3 = o => o.rotation.set(0, 0, 0);
  [f.body, f.chest, f.head, f.legL, f.legR, f.armL, f.armR, ...f.knees, ...f.ankles, ...f.elbows, ...f.wrists, ...f.flaps, ...f.fronts, ...f.backs, f.tool].forEach(z3);
  f.tool.visible = anim !== 'carry' && anim !== 'sweep' && anim !== 'play';
  // (the busker's lute: on the back, or across the front to be played)
  if (f.lute) {
    f.lute.visible = true;
    const L = f.lute, at = anim === 'play' ? f.luteFront : f.luteBack;
    L.position.set(at[0], at[1], at[2]);
    if (anim === 'play') L.rotation.set(0, Math.PI, LUTE_TILT); else L.rotation.set(0, 0, 0.6);
  }
  f.broom.rotation.set(0, 0, 0);
  f.broom.visible = anim === 'sweep'; f.crate.visible = anim === 'carry';
  const walking = anim === 'walk' || anim === 'carry';
  let bodyY = Math.sin(t * 1.8) * 0.006, crouch = 0;
  if (walking) {
    const ph = t * W.rate;
    f.legL.rotation.x = legSwing(ph) * W.stride;
    f.legR.rotation.x = legSwing(ph + Math.PI) * W.stride;
    const cw = Math.cos(ph);
    f.knees[0].rotation.x = W.knee * Math.max(0, -cw) * 0.6;
    f.knees[1].rotation.x = W.knee * Math.max(0, cw) * 0.6;
    bodyY = Math.abs(Math.cos(ph)) * W.bob;
    f.armL.rotation.set(-Math.sin(ph) * W.arms, 0, 0.06);
    f.armR.rotation.set(Math.sin(ph) * W.arms, 0, -0.06);
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = -W.elbow;
    f.chest.rotation.y = -Math.sin(ph) * W.twist;
    f.head.rotation.y = Math.sin(ph) * W.twist * 0.8;
  } else {
    // standing: breathing, the weight shifting from foot to foot now and then, the head looking about
    const shift = Math.sin(t * 0.35) * 0.03;
    f.body.rotation.z = shift; f.legL.rotation.z = f.legR.rotation.z = -shift;
    f.head.rotation.y = Math.sin(t * 0.47) * 0.35 * Math.max(0, Math.sin(t * 0.21 + 1));
    f.head.rotation.x = Math.sin(t * 0.31) * 0.05;
    f.chest.rotation.x = Math.sin(t * 1.8) * 0.012;
    f.armL.rotation.set(Math.sin(t * 0.9) * 0.03, 0, 0.07);
    f.armR.rotation.set(-Math.sin(t * 0.9) * 0.03, 0, -0.07);
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = -0.12;
  }
  if (anim === 'talk') {
    // hands talking, the right more than the left, nodding as they go
    f.armR.rotation.set(-0.35 + Math.sin(t * 2.3) * 0.15, 0.2, -0.12 - Math.sin(t * 1.3) * 0.08);
    f.elbows[1].rotation.x = -1.1 + Math.sin(t * 3.1) * 0.3;
    f.wrists[1].rotation.z = Math.sin(t * 2.7) * 0.3;
    f.armL.rotation.set(-0.2 + Math.sin(t * 1.7 + 1) * 0.15, -0.1, 0.1);
    f.elbows[0].rotation.x = -0.6 + Math.sin(t * 2.1 + 2) * 0.25;
    f.head.rotation.x = Math.sin(t * 4) * 0.06; f.head.rotation.y = Math.sin(t * 0.6) * 0.15;
    f.chest.rotation.y = Math.sin(t * 0.9) * 0.12;
  } else if (anim === 'wave') {
    // the right hand raised and waving from the elbow, the head tipped
    const up = Math.min(1, (t % 6) / 0.4), down = (t % 6) > 4.5 ? Math.max(0, 1 - ((t % 6) - 4.5) / 0.5) : 1, k = Math.min(up, down);
    f.armR.rotation.set(-0.25 * k, 0, -0.07 - 2.45 * k);
    f.elbows[1].rotation.z = Math.sin(t * 8) * 0.5 * k;
    f.elbows[1].rotation.x = -0.25 * k;
    f.head.rotation.z = -0.1 * k; f.head.rotation.y = 0;
    f.chest.rotation.z = 0.04 * k;
  } else if (anim === 'carry') {
    // the crate in both arms, leaning back a little against its weight
    f.armL.rotation.set(-0.95, 0, -0.02); f.armR.rotation.set(-0.95, 0, 0.02);
    f.elbows[0].rotation.x = f.elbows[1].rotation.x = -0.55;
    f.chest.rotation.x = -0.07; f.chest.rotation.y *= 0.3; f.head.rotation.y *= 0.3;
  } else if (anim === 'sweep') {
    // (v8, Jordan: held in both hands) the right hand high on the handle near the chest, the left low and ahead; both
    // hands are reached to their marks, then the broom is laid through where they actually got to, its brush on the
    // ground. The hands drift side to side with the shoulders' twist, so the brush swings wider than they do.
    const s = Math.sin(t * 2.4);
    f.chest.rotation.y = s * 0.18; f.chest.rotation.x = 0.1;
    const top = reach(f.armR, f.elbows[1], [0.0 + 0.02 * s, 0.2, 0.12]);
    const low = reach(f.armL, f.elbows[0], [0.06 + 0.035 * s, 0.1, 0.18]);
    holdBroom(f, top, low, bodyY);
    f.head.rotation.x = 0.2; f.head.rotation.y = s * 0.1;
    f.legL.rotation.x = -0.12; f.legR.rotation.x = 0.1; f.knees[0].rotation.x = 0.12; f.knees[1].rotation.x = 0.16;
  }
  else if (anim === 'brandish') {
    // (v9) squared up to fight: crouched, the weapon hand up and jabbing now and then, the other fist up on guard; a
    // bow or crossbow is levelled at you, the draw hand back at the string
    const s = Math.sin(t * 3.2), jab = Math.pow(Math.max(0, Math.sin(t * 1.6)), 6), P = f.d.prop;
    crouch = 0.012;
    f.legL.rotation.x = -0.35; f.legR.rotation.x = 0.2; f.knees[0].rotation.x = 0.45; f.knees[1].rotation.x = 0.2;
    f.chest.rotation.x = 0.16; f.chest.rotation.y = -0.22 + s * 0.04;
    f.head.rotation.x = -0.12; f.head.rotation.y = 0.18;
    if (P === 'shortbow' || P === 'crossbow') {
      f.chest.rotation.y = -0.3;
      f.armL.rotation.set(-1.45, 0, 0.12); f.elbows[0].rotation.x = -0.08;
      f.armR.rotation.set(-1.35, 0, -0.55); f.elbows[1].rotation.x = -1.7;
      f.head.rotation.y = 0.3;
    } else {
      // (v14) the weapon in whichever hand holds it (the right, for the hostile folk), the other on guard: mirrored
      const m = f.hand ? -1 : 1, W = f.hand ? f.armR : f.armL, G = f.hand ? f.armL : f.armR;
      W.rotation.set(-1.25 - jab * 0.55 + s * 0.06, 0, 0.12 * m); f.elbows[f.hand].rotation.x = -0.95 + jab * 0.75;
      G.rotation.set(-0.55, 0, -0.3 * m); f.elbows[1 - f.hand].rotation.x = -1.2;
      f.chest.rotation.y *= m; f.head.rotation.y *= m;
    }
  }
  else if (anim === 'play' && f.lute) {
    // (Jordan) playing the lute: the left hand on the neck, sliding along it now and then, the right strumming over
    // the body; the head bent to the strings, swaying to the tune
    const F = f.luteFront, neck = rotY(rotZ([0, 0.2 + Math.sin(t * 0.8) * 0.02, 0], LUTE_TILT), Math.PI);
    const sway = Math.sin(t * 1.3);
    f.chest.rotation.x = 0.05; f.chest.rotation.z = sway * 0.035; f.chest.rotation.y = 0.08;
    reach(f.armL, f.elbows[0], [F[0] + neck[0], F[1] + neck[1], F[2] + 0.03]);
    reach(f.armR, f.elbows[1], [F[0] - 0.01, F[1] + 0.01 + Math.sin(t * 9) * 0.03, F[2] + 0.05]);
    f.wrists[1].rotation.x = Math.sin(t * 9) * 0.25;
    f.head.rotation.x = 0.22; f.head.rotation.y = 0.25 + sway * 0.08; f.head.rotation.z = -sway * 0.05;
    f.legL.rotation.z = f.legR.rotation.z = 0; f.body.rotation.z = sway * 0.02;
  }
  // (v467) sitting, blended in by f.sitK (getting into bed): thighs out level, shins down, hands on the knees, and a
  // lean forward by f.lean as they sit down or stand up
  if (f.sitK > 0) {
    const k = f.sitK, mix = (a, b) => a + (b - a) * k;
    for (const L of [f.legL, f.legR]) { L.rotation.x = mix(L.rotation.x, -1.5); L.rotation.z *= 1 - k; }
    for (const K of f.knees) K.rotation.x = mix(K.rotation.x, 1.45);
    for (const A of [f.armL, f.armR]) A.rotation.x = mix(A.rotation.x, -0.55);
    for (const E of f.elbows) E.rotation.x = mix(E.rotation.x, -0.75);
    f.body.rotation.z *= 1 - k;
    bodyY *= 1 - k;
  }
  if (f.lean) f.chest.rotation.x += f.lean;
  // (v473) bent forward at the hips by f.hipBend (asleep, sunk into the mattress: the legs kept level)
  if (f.hipBend) { f.legL.rotation.x -= f.hipBend; f.legR.rotation.x -= f.hipBend; }
  f.body.position.y = bodyY - crouch;
  // (breathing sinks the body: the legs rise as much, so the feet stay on the ground)
  f.legL.position.y = f.legR.position.y = 0.36 - Math.min(0, bodyY);
  // feet kept level with the ground, and skirts swinging with their legs
  f.ankles[0].rotation.x = -(f.legL.rotation.x + f.knees[0].rotation.x) * FOLK_WALK.foot;
  f.ankles[1].rotation.x = -(f.legR.rotation.x + f.knees[1].rotation.x) * FOLK_WALK.foot;
  // (flaps come in left, right pairs)
  f.flaps.forEach((p, i) => p.rotation.x = (i % 2 ? f.legR : f.legL).rotation.x * 0.55);
  const k = f.flaps.length ? 0.55 : 0.9;
  for (const p of f.fronts) p.rotation.x = Math.min(0, f.legL.rotation.x, f.legR.rotation.x) * k;
  for (const p of f.backs) p.rotation.x = Math.max(0, f.legL.rotation.x, f.legR.rotation.x) * k;
  // a staff stands upright whatever the arm does: held a little forward when standing, its swing taken back out
  const hk = f.hand || 0, HA = hk ? f.armR : f.armL;
  if (f.staff && f.tool.visible) {
    if (anim === 'idle') { HA.rotation.x = -0.25; f.elbows[hk].rotation.x = -0.55; }
    f.tool.rotation.x = -(f.chest.rotation.x + HA.rotation.x + f.elbows[hk].rotation.x + f.wrists[hk].rotation.x);
  }
  // (v9) a bow stands upright and a crossbow lies level when levelled at you
  if (anim === 'brandish' && (f.d.prop === 'shortbow' || f.d.prop === 'crossbow'))
    f.tool.rotation.x = -(f.chest.rotation.x + f.armL.rotation.x + f.elbows[0].rotation.x + f.wrists[0].rotation.x);
}

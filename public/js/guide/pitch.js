/**
 * The pitch: the game's own one-liner, assembled from what the guide already knows.
 *
 * The randomiser page prints its result as "A Box Fight, set in the world of Star Wars. So fast you
 * barely think." — a game type, a brand, and a hook. This is the same sentence, built at the end of
 * the guided questionnaire instead of at the end of a spin.
 *
 * Where the two differ is what they have to work from. The randomiser draws every clause out of its
 * own reels: a flavour, a hook, and a row of facts (`verb · players · count · world · session`) that
 * describes the type underneath. The guide has none of that — `uefn_device_logic.json` carries a
 * label, a description, devices, questions and a core loop, and no voice at all.
 *
 * So the middle clause is the brand — which is exactly the rule the randomiser's own data file names
 * ("Brands use \"set in the world of {brand}\"") — and the voice below is written here, by hand, for
 * the 13 researched types. Those 13 are the ones that ask questions and carry a tailored plan, so they
 * are the ones a user can actually arrive at with a game worth pitching.
 *
 * The other 84 game types (74 drafts and the 10 "just give me the basics" entries) have no hook
 * written for them and are not given an invented one. They fall back to a straight reading: the type's
 * own description, in the type's own words. Nothing here claims a voice a game type has not earned.
 *
 * Pure module: no DOM, no data fetching, so `buildPitch` is unit-testable in plain node.
 */

/**
 * The voice of each researched game type.
 *
 * `noun` is the type's name as it reads inside the sentence. It is not always `label`: the data's
 * labels are list headings and are plural or compound where the sentence needs a singular ("Box
 * Fights" → "A Box Fight", "Deathrun / Obby" → "A Deathrun"), and "A Box Fights" is not a sentence.
 *
 * `hook` and `facts` are the two halves of the randomiser's result card. The hook names come from the
 * hook list the project owner supplied (public/data/randomiser.json), so the vocabulary is the
 * owner's; the example titles that file appends to each description ("Portal.", "Fall Guys.") are
 * dropped, because they belong to the reels rather than to a description of the game in front of you.
 *
 * `facts` is the "Underneath, that means" row: the verb, who you play with, how many, where, and how
 * long. Every value is either the owner's own number for that type or a plain reading of the type's
 * description in this data file — "A shrinking zone" for Zone Wars, whose description says the zone is
 * rapidly shrinking. Counts are only given where the owner supplied one.
 */
export const TYPE_VOICE = {
  combat_elimination_deathmatch: {
    noun: 'Elimination / Deathmatch',
    hook: { name: 'Brutal but fair', description: 'You die a lot, and every death was your fault.' },
    facts: ['Fighting', 'Solo or teams', 'One arena', '5–15 minutes']
  },
  combat_team_elimination: {
    noun: 'Team Elimination',
    hook: { name: 'Grand and serious', description: 'Played completely straight, with scale.' },
    facts: ['Fighting', 'Squads against squads', 'One arena', '5–15 minutes']
  },
  combat_zone_wars: {
    noun: 'Zone Wars',
    hook: { name: 'Tense, then sudden', description: 'Long quiet stretches so the loud bits land.' },
    facts: ['Fighting', 'Squads', '10–20', 'A shrinking zone', 'Under 5 minutes']
  },
  combat_box_fights: {
    noun: 'Box Fight',
    hook: { name: 'So fast you barely think', description: 'Reaction over planning.' },
    facts: ['Fighting', 'Teams against each other', '2–4', 'One arena', 'Under 5 minutes']
  },
  survival_horror_chase: {
    noun: 'Horror Chase',
    hook: { name: 'Slow and creeping', description: 'Dread that builds rather than jumps.' },
    facts: ['Surviving', 'Together against the game', '2–4', 'Rooms and corridors', '15–45 minutes']
  },
  adventure_action_rpg: {
    noun: 'Action RPG',
    hook: { name: 'Grand and serious', description: 'Played completely straight, with scale.' },
    facts: ['Exploring', 'On your own', 'A big open space', 'Longer than that']
  },
  sim_tycoon_tycoon: {
    noun: 'Tycoon',
    hook: { name: "Gentle — you can't really lose", description: 'No fail state worth worrying about.' },
    facts: ['Building', 'On your own', 'A hub with branches', 'Longer than that']
  },
  platforming_parkour: {
    noun: 'Parkour',
    hook: { name: 'Punishing, and proud of it', description: 'Hard on purpose, and it tells you so.' },
    facts: ['Getting through', 'Everyone for themselves', 'A course', '5–15 minutes']
  },
  platforming_deathrun_obby: {
    noun: 'Deathrun',
    hook: { name: 'Loud and stupid', description: 'Over in a minute and nobody minds.' },
    facts: ['Getting through', 'Everyone for themselves', 'A trap-filled course', '5–15 minutes']
  },
  puzzle_escape_room: {
    noun: 'Escape Room',
    hook: { name: 'Tense, then sudden', description: 'Long quiet stretches so the loud bits land.' },
    facts: ['Solving', 'Together against the game', '2–4', 'Rooms and corridors', '15–45 minutes']
  },
  party_prop_hunt: {
    noun: 'Prop Hunt',
    hook: { name: "Chaotic — nobody's in control", description: 'More going on than anyone can track.' },
    facts: ['Hiding', 'A few against many', '5–10', 'Rooms and corridors', '5–15 minutes']
  },
  sports_circuit_racing: {
    noun: 'Circuit Racing',
    hook: { name: 'So fast you barely think', description: 'Reaction over planning.' },
    facts: ['Getting through', 'Everyone for themselves', 'A circuit', 'Under 5 minutes']
  },
  sports_time_trial: {
    noun: 'Time Trial',
    hook: { name: 'Punishing, and proud of it', description: 'Hard on purpose, and it tells you so.' },
    facts: ['Getting through', 'On your own', 'A course', 'Under 5 minutes']
  }
};

/** "A" or "An", from the first letter. Every game type name in the data file takes one of the two. */
export function articleFor(word) {
  return /^[aeiou]/i.test(String(word || '').trim()) ? 'An' : 'A';
}

/**
 * The middle clause of the sentence: the brand.
 *
 * "Original (No Brand Template)" is not a world, so it adds nothing rather than producing "set in the
 * world of Original". An unbranded game gets the shorter sentence.
 */
export function brandClause(brand) {
  if (!brand || !brand.id || brand.id === 'original') return '';
  return `, set in the world of ${brand.label}`;
}

/**
 * Build the pitch for one session.
 *
 * @param {{key?: string, type?: object, category?: object, brand?: object}} session
 * @returns {null | {
 *   strapline: string,
 *   noun: string,
 *   description: string,
 *   facts: string[],
 *   hook: {name: string, description: string} | null,
 *   voice: 'researched' | 'baseline' | 'essentials'
 * }}
 */
export function buildPitch({ key, type, category, brand } = {}) {
  if (!type) return null;

  const brandBit = brandClause(brand);
  const description = type.description || '';

  /* The ten "just give me the basics" entries are not a game type — they are a promise to hand over
   * the category's essentials and let you shape the rest. Naming one in the sentence reads as
   * nonsense ("A Just give me the basics"), so it is described instead of named. */
  if (type.is_custom) {
    const family = category && category.label ? category.label.toLowerCase() : 'game';
    return {
      strapline: `An essentials ${family} build${brandBit}. ${description}`.trim(),
      noun: type.label,
      description,
      facts: [],
      hook: null,
      voice: 'essentials'
    };
  }

  const voice = TYPE_VOICE[key] || null;
  const noun = (voice && voice.noun) || type.label;
  const hook = (voice && voice.hook) || null;
  const facts = (voice && voice.facts) || [];
  const closing = hook ? ` ${hook.name}.` : '';

  return {
    strapline: `${articleFor(noun)} ${noun}${brandBit}.${closing}`,
    noun,
    description,
    facts,
    hook,
    voice: hook ? 'researched' : 'baseline'
  };
}

/** The facts row as one line, or '' when there is nothing honest to say. */
export function factsLine(facts) {
  return (facts || []).filter(Boolean).join(' · ');
}

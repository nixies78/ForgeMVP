/**
 * User-facing copy that is not domain data.
 *
 * v1 kept the walkthrough bodies and the screen wording as English strings inside its render
 * functions, which made them invisible to anyone maintaining the content and left no path for a
 * second language. Everything a user reads lives here or in the JSON data file, never in a screen.
 *
 * The walkthrough copy is carried over from v1 because the handoff flags it as good copy — see
 * UEFN_GUIDE_V2_HANDOFF.md § 2.2 ("Step bodies (carry these over — they are good copy)").
 */

/* ---------------------------------- home screen ---------------------------------- */

/**
 * The three design modes. `guided` is the real flow; the other two are honest placeholders —
 * the brief's rule is "a visible dead end is worse than no panel", so each says what it will do
 * and that it is not built yet rather than pretending to work.
 */
export const DESIGN_MODES = [
  {
    id: 'guided',
    label: 'Answer Questions',
    action: 'Start questions',
    description:
      "Work through a short set of questions about the game you want. We'll narrow it down to an exact game type and build you a step-by-step plan.",
    status: 'live'
  },
  {
    id: 'randomise',
    label: 'Randomise',
    action: 'Spin the wheel',
    description:
      "Not sure what to make? Spin the wheel and let it pick a game idea for you — a game type, a twist and a brand to build around.",
    status: 'planned'
  },
  {
    id: 'ai_chat',
    label: 'Chat with AI',
    action: 'Start chatting',
    description:
      'Describe your idea in your own words and talk it through. The AI asks follow-ups and turns the conversation into a buildable plan.',
    status: 'planned'
  }
];

/** What a placeholder screen says. Honest about status, specific about the intent. */
export const PLACEHOLDER_NOTES = {
  randomise: [
    'The idea: pick a game type, a twist and a brand at random, then take the same question flow as the guided mode.',
    'It needs a twist library and a rule for which twists suit which game types — neither exists yet, so spinning a wheel today would only produce something arbitrary.'
  ],
  ai_chat: [
    'The idea: describe the game in your own words, answer a few follow-ups, and have the conversation resolved into the same plan the guided mode produces.',
    'The resolution engine it would feed is already built — this screen is the missing conversation layer.'
  ]
};

/* -------------------------------- experience screen -------------------------------- */

/**
 * Four levels, asked fresh every session and never saved with the game (as v1 did).
 *
 * v1 promised "advanced topics" to three of these four and delivered them to nobody. Rather than
 * keep a promise the content does not back, the wording now describes what actually changes, and
 * the screen says so plainly. See UEFN_GUIDE_V2_HANDFOFF § Part 9, item 8.
 */
export const EXPERIENCE_LEVELS = [
  {
    id: 'beginner',
    label: 'Complete beginner',
    description: 'Explain everything, step by step.',
    effect: 'Adds a Basic Navigation step to your walkthrough.'
  },
  {
    id: 'some',
    label: 'Some experience',
    description: "Don't give me the basics — I've done this before.",
    effect: 'Skips the Basic Navigation step.'
  },
  {
    id: 'experienced',
    label: 'Experienced',
    description: 'Skip the tour, get to the plan.',
    effect: 'Skips the Basic Navigation step.'
  },
  {
    id: 'expert',
    label: 'Expert',
    description: 'Just here for the plan.',
    effect: 'Skips the Basic Navigation step.'
  }
];

export const EXPERIENCE_HONESTY_NOTE =
  'Right now only the beginner path changes the walkthrough: everyone else takes the shorter route. ' +
  'Level-specific advanced material is not written yet, so these options are worded to describe what they do.';

/* ---------------------------------- walkthrough ---------------------------------- */

/**
 * The five build steps. `basic_nav` is filtered out unless the level is `beginner`, and
 * `brand` / `layoutTip` are filled in from the user's own answers when the step body is rendered.
 */
export const WALKTHROUGH_STEPS = [
  {
    id: 'create_project',
    title: 'Create Your Project',
    video: 'videos/01_ProjectSetup.mp4',
    body: [
      'Open UEFN from the Epic Games Launcher, or choose "Launch UEFN" from the Creative options in Fortnite.',
      'Pick New Project in the Project Browser.',
      'Name it after the idea you just designed, so it stays findable in three weeks.'
    ]
  },
  {
    id: 'basic_nav',
    title: 'Basic Navigation',
    video: 'videos/02_BasicNavigation.mp4',
    body: [
      'Fly the camera with WASD, hold the right mouse button to look around, and scroll or use Q and E to change fly speed.',
      'The Outliner, top right, lists every object and device in your island.',
      'The Details panel, bottom right, shows every setting for whatever is selected — this is where devices get configured later.',
      'The Content Browser along the bottom is where devices, props and assets are found.',
      'Left-click to select something, then use the Move, Rotate and Scale gizmos with W, E and R.'
    ],
    tip: 'Spend a few minutes just flying around and clicking on things in a blank project — muscle memory here will make every later step faster.'
  },
  {
    id: 'block_out',
    title: 'Block Out Your Island',
    video: 'videos/03_BlockOut.mp4',
    body: [
      'Rough out the physical layout with basic shapes before placing any devices.',
      "Don't worry about how it looks yet — this pass is about where things go and how players move between them."
    ]
  },
  {
    id: 'core_devices',
    title: 'Add Your Core Game Loop Devices',
    video: 'videos/04_CoreDevices.mp4',
    body: [
      'Add the devices from your plan below, then open each one and set the options listed under it.',
      'Configure them in the order shown: the game-loop devices first, because the devices under them depend on those choices.'
    ]
  },
  {
    id: 'look_good',
    title: 'Make It Look Good',
    video: 'videos/05_LookGood.mp4',
    body: [
      'Add the atmosphere and polish devices listed below — they change how the island feels without changing how it plays.',
      'Wherever a device has an asset picker, reach for your brand template first.'
    ]
  }
];

export const WALKTHROUGH_BRAND_LINE = {
  branded: (brandLabel) =>
    `Choose the ${brandLabel} brand template from the template picker so your project starts with its themed assets already loaded.`,
  original: 'Choose a blank/default Fortnite template — no brand template needed for an original game.'
};

/* ------------------------------------ generic UI ------------------------------------ */

export const UI = {
  appName: 'UEFN Game Guide',
  skipToContent: 'Skip to content',
  back: 'Back',
  changeGameType: 'Change game type',
  changeCategory: 'Change category',
  letsGoBack: "Let's go back",
  accept: "I'm okay with this",
  startBuilding: 'Start Building',
  next: 'Next',
  finish: 'Finish & back to my games',
  previous: 'Previous',
  editGameType: 'Edit game type',
  savedGamesTitle: 'Your games',
  noSavedGames: 'Nothing saved yet. Finish a design and it will appear here.',
  savePrompt: 'Name this game so you can find it later',
  savePlaceholder: 'e.g. Mosslight',
  save: 'Save',
  rename: 'Rename',
  remove: 'Delete',
  guidedInstead: 'Answer questions instead',
  visibleWithDevModeOff: 'Only researched game types are shown. Turn on dev mode to see all 97.',
  baselineOnly:
    'Baseline only — this game type has not been researched yet, so you get the category essentials rather than a tailored device list.',
  questionCount: (n, total) => `Question ${n} of ${total}`,
  allAnswered: 'All questions answered'
};

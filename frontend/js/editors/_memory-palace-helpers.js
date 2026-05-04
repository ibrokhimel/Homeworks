// frontend/js/editors/_memory-palace-helpers.js
// Pure helpers for the Memory Palace (Method of Loci) builder editor.
//
// Mirrors `_real-life-challenge-helpers.js` / `_ttt-helpers.js` shape so
// tests can drive helpers directly from Node (no browser surface). Exposed
// on `window.MemoryPalaceHelpers` for the browser editor and on
// `module.exports` for Node regression tests.
//
// Spec sources:
//   MEMORY_PALACE_BACKEND_PLAN.md §1 (schema), §4 (builder lane), §4.2 (catalog)
//   standards/system/games/Game_Mechanics_Docs/05_Memory_Palace/memory-palace-concept-definition.md

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Subject family mapping
  // Maps homework.subject (Uzbek subject names) to canonical subject_family.
  // ---------------------------------------------------------------------------

  const SUBJECT_FAMILY_MAP = {
    // Biology
    biologiya: "bio",
    tibbiyot: "bio",
    // Chemistry
    kimyo: "chem",
    // Physics
    fizika: "phys",
    // Math
    matematika: "math",
    algebra: "math",
    geometriya: "math",
    // History / Geography
    tarix: "history",
    geografiya: "history",
    // Languages
    "ona-tili": "lang",
    adabiyot: "lang",
    "ingliz-tili": "lang",
    "rus-tili": "lang",
    // Art / Music
    "san'at": "art",
    musiqa: "art",
  };

  /**
   * subjectFamilyFor(subject) -> string
   * Maps homework.subject (Uzbek) to canonical subject_family key.
   * Returns "universal" for unknown / null subjects.
   */
  function subjectFamilyFor(subject) {
    if (subject == null) return "universal";
    const s = String(subject).toLowerCase().trim();
    if (!s) return "universal";
    return SUBJECT_FAMILY_MAP[s] || "universal";
  }

  // ---------------------------------------------------------------------------
  // Grade band mapping (matches plan §1.4 and builder brief)
  // 1-4  → "low"
  // 5-7  → "mid"
  // 8-11 → "high"
  // ---------------------------------------------------------------------------

  /**
   * gradeBandFor(grade) -> "low" | "mid" | "high"
   * Default "mid" when grade is missing or non-numeric.
   */
  function gradeBandFor(grade) {
    const g = Number(grade);
    if (!Number.isFinite(g)) return "mid";
    if (g <= 4) return "low";
    if (g <= 7) return "mid";
    return "high";
  }

  // ---------------------------------------------------------------------------
  // Palace Library — curated catalog keyed by subject_family.
  // 8 families × 4-6 palaces × 5 locations = ~200 location entries.
  // Sensory cues: vivid, multi-sensory, subject-relevant.
  // ---------------------------------------------------------------------------

  const PALACE_LIBRARY = {
    // ─────────────────────────────────────────────────────────────────────────
    // bio — Biology / Medicine (6 palaces)
    // ─────────────────────────────────────────────────────────────────────────
    bio: [
      {
        key: "bio_cell",
        name: "Inside the Cell",
        icon: "🧬",
        subject_family: "bio",
        tier: "basic",
        description:
          "Cell membrane gate, nucleus chamber, mitochondria station, ribosome workshop, chloroplast garden.",
        locations: [
          {
            name: "Cell membrane gate",
            sensory_cue: "Imagine a smart border checkpoint — molecules wait in line, only the right ones pass through the flexible rubber door.",
          },
          {
            name: "Nucleus chamber",
            sensory_cue: "See a glowing control room at the center — towering DNA scrolls line the walls, humming with coded instructions.",
          },
          {
            name: "Mitochondria station",
            sensory_cue: "Picture a roaring energy plant with bright orange furnaces converting sugar into crackling electricity.",
          },
          {
            name: "Ribosome workshop",
            sensory_cue: "Hear the rapid click-clack of tiny protein assembly machines stitching amino acids together like a beaded necklace.",
          },
          {
            name: "Chloroplast garden",
            sensory_cue: "Feel the warmth of brilliant sunlight streaming through green solar panels that silently brew glucose from air and light.",
          },
        ],
      },
      {
        key: "bio_lab",
        name: "Biology Lab",
        icon: "🧪",
        subject_family: "bio",
        tier: "basic",
        description:
          "Microscope table, specimen tray, DNA poster wall, incubator, cold storage cabinet.",
        locations: [
          {
            name: "Microscope table",
            sensory_cue: "See a brilliant white slide under the lens — a hidden world of cells springs into vivid focus.",
          },
          {
            name: "Specimen tray",
            sensory_cue: "Picture neat rows of labelled glass jars, each a tiny museum of a different organism preserved in amber fluid.",
          },
          {
            name: "DNA poster wall",
            sensory_cue: "Imagine a massive rainbow-coloured double helix twisting floor to ceiling, base pairs lit up like piano keys.",
          },
          {
            name: "Incubator",
            sensory_cue: "Feel a warm humid breath when you open the door — cultures quietly multiply in the steady 37-degree heat.",
          },
          {
            name: "Cold storage cabinet",
            sensory_cue: "A frosty cloud escapes when you pull the handle; preserved samples gleam behind frosted glass like sleeping specimens.",
          },
        ],
      },
      {
        key: "bio_dna_hall",
        name: "DNA Helix Hall",
        icon: "🔬",
        subject_family: "bio",
        tier: "basic",
        description:
          "Replication fork, transcription desk, translation ribosome, mutation checkpoint, repair station.",
        locations: [
          {
            name: "Replication fork",
            sensory_cue: "Watch two strands unzip like a long zipper pulled apart — new complementary strands race to fill the gap.",
          },
          {
            name: "Transcription desk",
            sensory_cue: "An RNA scribe rapidly copies the DNA message onto a fresh strand, letter by letter, beneath a humming spotlight.",
          },
          {
            name: "Translation ribosome",
            sensory_cue: "A molecular machine reads the RNA tape and snaps amino acids together with a satisfying metallic click.",
          },
          {
            name: "Mutation checkpoint",
            sensory_cue: "A red alarm light flashes whenever a wrong letter is inserted — security enzymes sprint in to flag the error.",
          },
          {
            name: "Repair station",
            sensory_cue: "Repair proteins work like careful editors, snipping out the flawed segment and pasting in the correct sequence.",
          },
        ],
      },
      {
        key: "bio_ecosystem",
        name: "Ecosystem Forest",
        icon: "🌿",
        subject_family: "bio",
        tier: "basic",
        description:
          "Forest canopy, forest floor, soil layer, stream bank, decomposer corner.",
        locations: [
          {
            name: "Forest canopy",
            sensory_cue: "Look up at a cathedral of leaves — sunlight filters green-gold through the topmost branches, producers bathing in energy.",
          },
          {
            name: "Forest floor",
            sensory_cue: "Crunch through fallen leaves; rabbits, deer, and insects move between the roots — primary consumers on a live stage.",
          },
          {
            name: "Soil layer",
            sensory_cue: "Dig into the dark earth and feel its cool, mineral smell — billions of microbes process every fallen twig.",
          },
          {
            name: "Stream bank",
            sensory_cue: "Hear the gurgle of water; aquatic insects and frogs hunt at the water's edge in a constant food-chain relay.",
          },
          {
            name: "Decomposer corner",
            sensory_cue: "See fungi feasting on a rotting log, silently returning nutrients to the soil in a slow, earthy transformation.",
          },
        ],
      },
      {
        key: "bio_microscope",
        name: "Microscope Lab",
        icon: "🔭",
        subject_family: "bio",
        tier: "basic",
        description:
          "Slide preparation bench, objective lens row, staining station, darkfield chamber, digital display wall.",
        locations: [
          {
            name: "Slide preparation bench",
            sensory_cue: "Carefully press a tissue-thin slice of onion skin onto a wet slide — the transparent cells shimmer in water.",
          },
          {
            name: "Objective lens row",
            sensory_cue: "Click through 4×, 10×, 40× lenses — each click magnifies the tiny world further, colours sharpening into focus.",
          },
          {
            name: "Staining station",
            sensory_cue: "Drop brilliant blue methylene onto the slide — cell walls absorb the dye and leap into vivid purple contrast.",
          },
          {
            name: "Darkfield chamber",
            sensory_cue: "The room goes black; only the specimen glows like a constellation of sparkling organelles against a night sky.",
          },
          {
            name: "Digital display wall",
            sensory_cue: "A giant screen projects the microscopic image — the whole class can see the beating cilia as if they're enormous.",
          },
        ],
      },
      {
        key: "bio_anatomy",
        name: "Anatomy Studio",
        icon: "🫀",
        subject_family: "bio",
        tier: "basic",
        description:
          "Skeleton model corner, organ table, nerve board, circulatory map wall, dissection tray.",
        locations: [
          {
            name: "Skeleton model corner",
            sensory_cue: "Reach out and tap a plastic bone — it swings with a hollow clack, every joint labelled in red ink.",
          },
          {
            name: "Organ table",
            sensory_cue: "See the heart, lungs, liver, and kidneys laid out in order — each organ a unique shape and deep red-brown colour.",
          },
          {
            name: "Nerve board",
            sensory_cue: "A lit diagram shows nerve paths branching like lightning from the spinal cord, electric pulses racing outward.",
          },
          {
            name: "Circulatory map wall",
            sensory_cue: "Red arteries and blue veins cover the wall like a subway map — trace the blood's round-trip journey with your finger.",
          },
          {
            name: "Dissection tray",
            sensory_cue: "The sharp smell of preservative fills the air; instruments glint under bright light above the specimen.",
          },
        ],
      },
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // chem — Chemistry (6 palaces)
    // ─────────────────────────────────────────────────────────────────────────
    chem: [
      {
        key: "chem_periodic_hall",
        name: "Periodic Table Hall",
        icon: "⚗️",
        subject_family: "chem",
        tier: "basic",
        description:
          "Alkali metal corridor, noble gas lounge, transition metal forge, halogen vault, lanthanide gallery.",
        locations: [
          {
            name: "Alkali metal corridor",
            sensory_cue: "Walk past sodium and potassium blocks sealed in oil jars — drop one in water and a violent hiss-pop fills the hallway.",
          },
          {
            name: "Noble gas lounge",
            sensory_cue: "Step into a calm glowing room — neon tubes cast warm red-orange light; argon sighs contentedly, never reacting with anyone.",
          },
          {
            name: "Transition metal forge",
            sensory_cue: "Feel intense heat from glowing iron, copper, and gold ingots being hammered — their electrons bridging multiple valence states.",
          },
          {
            name: "Halogen vault",
            sensory_cue: "The choking smell of chlorine makes your eyes water — yellow-green gas presses against the thick vault glass.",
          },
          {
            name: "Lanthanide gallery",
            sensory_cue: "Dim, mysterious chambers lined with rare silvery metals — their names almost impossible to pronounce, their uses astonishing.",
          },
        ],
      },
      {
        key: "chem_reaction_workshop",
        name: "Reaction Workshop",
        icon: "💥",
        subject_family: "chem",
        tier: "basic",
        description:
          "Reactant conveyor, activation energy ramp, transition state peak, product collector, catalyst shelf.",
        locations: [
          {
            name: "Reactant conveyor",
            sensory_cue: "Molecules ride a conveyor belt toward each other, building up kinetic energy, bumping together with increasing frequency.",
          },
          {
            name: "Activation energy ramp",
            sensory_cue: "Imagine climbing a steep hill — only the fastest, most energetic molecules can reach the top and react.",
          },
          {
            name: "Transition state peak",
            sensory_cue: "At the hilltop, bonds are half-broken, half-formed — a teetering unstable molecule suspended in a single frozen instant.",
          },
          {
            name: "Product collector",
            sensory_cue: "On the other side of the hill, new molecules tumble down into the collection basin, releasing energy as heat and light.",
          },
          {
            name: "Catalyst shelf",
            sensory_cue: "A catalyst sits on a special shelf — it lowers the hill's height, speeding reactions without being consumed itself.",
          },
        ],
      },
      {
        key: "chem_crystal_cave",
        name: "Crystal Cave",
        icon: "💎",
        subject_family: "chem",
        tier: "basic",
        description:
          "Ionic lattice chamber, covalent crystal wall, metallic bond floor, hydrogen bond pool, Van der Waals mist.",
        locations: [
          {
            name: "Ionic lattice chamber",
            sensory_cue: "Touch the sharp corners of a salt crystal — positive and negative ions locked in a rigid, perfectly ordered grid.",
          },
          {
            name: "Covalent crystal wall",
            sensory_cue: "Diamond studs the wall — carbon atoms sharing electrons so evenly that the entire structure is one giant hard molecule.",
          },
          {
            name: "Metallic bond floor",
            sensory_cue: "Walk on a floor of free electrons flowing like a sea beneath positive metal ions — electricity runs through every step.",
          },
          {
            name: "Hydrogen bond pool",
            sensory_cue: "Water molecules cling to each other like tiny magnets — their hydrogen bonds giving the pool its remarkable surface tension.",
          },
          {
            name: "Van der Waals mist",
            sensory_cue: "A fine mist of noble gas atoms drifts past — weak fleeting attractions form and break in milliseconds, barely touching.",
          },
        ],
      },
      {
        key: "chem_gas_chamber",
        name: "Gas Chamber",
        icon: "🌫️",
        subject_family: "chem",
        tier: "basic",
        description:
          "Pressure gauge wall, temperature dial, Boyle's Law piston, Charles' Law balloon, diffusion corridor.",
        locations: [
          {
            name: "Pressure gauge wall",
            sensory_cue: "Watch the needle jump as gas molecules bombard the walls — more molecules, more collisions, higher pressure.",
          },
          {
            name: "Temperature dial",
            sensory_cue: "Turn the dial up — gas molecules race faster, colliding harder and more often, pushing the container walls outward.",
          },
          {
            name: "Boyle's Law piston",
            sensory_cue: "Squeeze the piston — the volume shrinks, the same molecules now crowd into half the space, pressure doubling perfectly.",
          },
          {
            name: "Charles' Law balloon",
            sensory_cue: "Heat a balloon and watch it swell — the gas expands in direct proportion to temperature, a perfect linear relationship.",
          },
          {
            name: "Diffusion corridor",
            sensory_cue: "Release a perfume at one end; molecules spread randomly but steadily toward the other end — high to low concentration.",
          },
        ],
      },
      {
        key: "chem_acid_base_lab",
        name: "Acid-Base Laboratory",
        icon: "🧫",
        subject_family: "chem",
        tier: "basic",
        description:
          "pH meter station, indicator rack, neutralisation bench, buffer solution tank, titration burette.",
        locations: [
          {
            name: "pH meter station",
            sensory_cue: "Dip the electrode into lemon juice — the digital display flashes 2.1, glowing acid-red on the pH scale.",
          },
          {
            name: "Indicator rack",
            sensory_cue: "Rows of bottles: litmus turns red in acid, blue in base; phenolphthalein blazes pink in alkaline solution.",
          },
          {
            name: "Neutralisation bench",
            sensory_cue: "Mix acid and base carefully — the pink indicator fades to colourless at the exact moment of neutralisation.",
          },
          {
            name: "Buffer solution tank",
            sensory_cue: "Add a drop of strong acid — the pH barely shifts; the buffer absorbs the assault and holds steady.",
          },
          {
            name: "Titration burette",
            sensory_cue: "Watch droplets fall from the glass burette, counting until the solution flips colour at the precise equivalence point.",
          },
        ],
      },
      {
        key: "chem_organic_kitchen",
        name: "Organic Kitchen",
        icon: "🍶",
        subject_family: "chem",
        tier: "basic",
        description:
          "Hydrocarbon stove, functional group shelf, esterification pot, polymer loom, benzene ring table.",
        locations: [
          {
            name: "Hydrocarbon stove",
            sensory_cue: "Methane burns with a clean blue flame — chains of carbon and hydrogen releasing energy, CO₂ rising in warm wisps.",
          },
          {
            name: "Functional group shelf",
            sensory_cue: "Labelled jars of -OH, -COOH, -NH₂ sit in a row — each group changing the molecule's personality and reactions.",
          },
          {
            name: "Esterification pot",
            sensory_cue: "Acid plus alcohol over heat — the sweet fruity scent of ester fills the kitchen as water is expelled as a by-product.",
          },
          {
            name: "Polymer loom",
            sensory_cue: "Monomers click together on a weaving loom — thousands of units linking into a long flexible polymer chain.",
          },
          {
            name: "Benzene ring table",
            sensory_cue: "A flat hexagonal table: six carbon atoms sharing delocalised electrons in a ring, resonance structures drawn in chalk.",
          },
        ],
      },
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // phys — Physics (6 palaces)
    // ─────────────────────────────────────────────────────────────────────────
    phys: [
      {
        key: "phys_workshop",
        name: "Physics Workshop",
        icon: "⚙️",
        subject_family: "phys",
        tier: "basic",
        description:
          "Force balance, friction bench, Newton's apple tree, momentum track, torque wheel.",
        locations: [
          {
            name: "Force balance",
            sensory_cue: "Two teams pull on a rope attached to a scale — when forces equalise, the scale reads zero and the knot hangs perfectly still.",
          },
          {
            name: "Friction bench",
            sensory_cue: "Drag a block across sandpaper — feel the rough resistance gripping back, converting kinetic energy to heat underhand.",
          },
          {
            name: "Newton's apple tree",
            sensory_cue: "An apple drops straight down with a satisfying thud — gravity accelerating it at exactly 9.8 m/s² every single time.",
          },
          {
            name: "Momentum track",
            sensory_cue: "Two steel carts collide on a frictionless rail — their combined momentum before equals the total momentum after, perfectly.",
          },
          {
            name: "Torque wheel",
            sensory_cue: "Push far from the axle and the wheel spins easily; push near the centre and you struggle — distance multiplies the force.",
          },
        ],
      },
      {
        key: "phys_energy_plant",
        name: "Energy Plant",
        icon: "⚡",
        subject_family: "phys",
        tier: "basic",
        description:
          "Potential energy tower, kinetic energy floor, heat converter, electrical generator, conservation ledger.",
        locations: [
          {
            name: "Potential energy tower",
            sensory_cue: "Stand at the top — every metre of height stores gravitational energy like a coiled spring waiting to be released.",
          },
          {
            name: "Kinetic energy floor",
            sensory_cue: "Things speed up as they fall — kinetic energy grows exactly as potential energy shrinks, the exchange precise and elegant.",
          },
          {
            name: "Heat converter",
            sensory_cue: "Friction turns mechanical energy into heat — touch the warm brakes after a hard stop and feel the conversion yourself.",
          },
          {
            name: "Electrical generator",
            sensory_cue: "Magnets spin inside coils of wire — motion becomes electricity with a steady hum, invisible force made useful.",
          },
          {
            name: "Conservation ledger",
            sensory_cue: "An accountant's ledger with a running total that never changes — energy transforms but the final sum is always identical.",
          },
        ],
      },
      {
        key: "phys_motion_track",
        name: "Motion Track",
        icon: "🏃",
        subject_family: "phys",
        tier: "basic",
        description:
          "Starting line displacement, velocity lane, acceleration ramp, projectile launch pad, velocity-time graph board.",
        locations: [
          {
            name: "Starting line displacement",
            sensory_cue: "Mark the start and end with chalk — displacement is the straight-line arrow from start to finish, not the path you ran.",
          },
          {
            name: "Velocity lane",
            sensory_cue: "A speedometer on each lane — velocity is speed with a direction arrow pointing ahead, not just a number.",
          },
          {
            name: "Acceleration ramp",
            sensory_cue: "Step onto the ramp — your speed increases every second by the same steady amount, the ramp never letting you coast.",
          },
          {
            name: "Projectile launch pad",
            sensory_cue: "A ball is launched horizontally — gravity pulls it down while inertia carries it forward, tracing a perfect parabola.",
          },
          {
            name: "Velocity-time graph board",
            sensory_cue: "The slope of the line shows acceleration; the area under the line shows displacement — two answers in one clean graph.",
          },
        ],
      },
      {
        key: "phys_optics_studio",
        name: "Optics Studio",
        icon: "🔆",
        subject_family: "phys",
        tier: "basic",
        description:
          "Reflection mirror, refraction prism, converging lens bench, concave mirror stage, colour spectrum wall.",
        locations: [
          {
            name: "Reflection mirror",
            sensory_cue: "A laser beam bounces off the mirror at exactly the same angle it arrived — the angle of incidence perfectly mirrored.",
          },
          {
            name: "Refraction prism",
            sensory_cue: "White light enters and bends as it slows — splitting into a glorious fan of violet through red on the opposite wall.",
          },
          {
            name: "Converging lens bench",
            sensory_cue: "Parallel rays bent inward — all focusing to a brilliant single point, a burning spot of concentrated light.",
          },
          {
            name: "Concave mirror stage",
            sensory_cue: "Stand back and see an inverted, magnified image of the candle flame floating in mid-air in front of the curved mirror.",
          },
          {
            name: "Colour spectrum wall",
            sensory_cue: "ROYGBIV painted in glowing bands — each colour a different wavelength of electromagnetic radiation, vibrating at its own frequency.",
          },
        ],
      },
      {
        key: "phys_circuit_board",
        name: "Circuit Board",
        icon: "🔌",
        subject_family: "phys",
        tier: "basic",
        description:
          "Battery terminal, series resistor row, parallel branch junction, voltmeter post, ammeter gate.",
        locations: [
          {
            name: "Battery terminal",
            sensory_cue: "Touch the terminal — electrons are pumped by the EMF, like water pushed uphill by a pump, waiting to flow.",
          },
          {
            name: "Series resistor row",
            sensory_cue: "Resistors lined up in a single lane — the current through each is identical, but voltage drops at every hurdle.",
          },
          {
            name: "Parallel branch junction",
            sensory_cue: "The current splits at a fork like a river delta — each branch carries only part of the total flow, independently.",
          },
          {
            name: "Voltmeter post",
            sensory_cue: "The voltmeter reads the height difference — it stands across a component, not in the path, so it doesn't disrupt flow.",
          },
          {
            name: "Ammeter gate",
            sensory_cue: "The ammeter sits in the stream, counting every electron that passes — it must be in series, or the circuit breaks.",
          },
        ],
      },
      {
        key: "phys_gravity_tower",
        name: "Gravity Tower",
        icon: "🏗️",
        subject_family: "phys",
        tier: "basic",
        description:
          "Free-fall shaft, orbital balcony, tidal force room, escape velocity launch deck, gravitational field map.",
        locations: [
          {
            name: "Free-fall shaft",
            sensory_cue: "Step into weightlessness — all objects fall together regardless of mass, a feather and hammer dropping side by side.",
          },
          {
            name: "Orbital balcony",
            sensory_cue: "Look out at a satellite circling — it falls toward Earth constantly but also moves forward fast enough to keep missing.",
          },
          {
            name: "Tidal force room",
            sensory_cue: "The near side is pulled harder than the far side — this gradient stretches everything, creating ocean bulges on opposite shores.",
          },
          {
            name: "Escape velocity launch deck",
            sensory_cue: "The rocket must reach 11.2 km/s to break free — below that speed, gravity wins and pulls it back every time.",
          },
          {
            name: "Gravitational field map",
            sensory_cue: "Field lines converge toward the planet's centre like spokes of a wheel — density of lines shows the field's strength.",
          },
        ],
      },
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // math — Mathematics (6 palaces)
    // ─────────────────────────────────────────────────────────────────────────
    math: [
      {
        key: "math_formula_lab",
        name: "Formula Lab",
        icon: "🧮",
        subject_family: "math",
        tier: "basic",
        description:
          "Equation workbench, variable locker, identity mirror, inequality scale, proof construction desk.",
        locations: [
          {
            name: "Equation workbench",
            sensory_cue: "Both sides of a perfectly balanced scale — whatever you do to one side you must do to the other, maintaining equality.",
          },
          {
            name: "Variable locker",
            sensory_cue: "Lockers labelled x, y, z — open one and a number falls out, different each problem but always consistent within.",
          },
          {
            name: "Identity mirror",
            sensory_cue: "Look in the mirror — sin²x + cos²x always equals 1, a perfect reflection that never changes no matter the angle.",
          },
          {
            name: "Inequality scale",
            sensory_cue: "One side heavier, arrow pointing toward the smaller — the scale tips to show which expression wins the comparison.",
          },
          {
            name: "Proof construction desk",
            sensory_cue: "Lay out logical bricks one by one — each step justified, each statement following necessarily from the last, Q.E.D.",
          },
        ],
      },
      {
        key: "math_geometry_garden",
        name: "Geometry Garden",
        icon: "📐",
        subject_family: "math",
        tier: "basic",
        description:
          "Triangle bed, circle fountain, polygon maze, Pythagorean trellis, angle measuring sundial.",
        locations: [
          {
            name: "Triangle bed",
            sensory_cue: "Three flower beds always adding to 180° — no matter how you reshape the triangle, the angles share exactly a straight line.",
          },
          {
            name: "Circle fountain",
            sensory_cue: "Water arcs in perfect parabolas — every drop on the rim is exactly one radius away from the central spray head.",
          },
          {
            name: "Polygon maze",
            sensory_cue: "Navigate a maze with 5, 6, 8 walls — each interior angle growing as sides increase, hexagons tiling the floor perfectly.",
          },
          {
            name: "Pythagorean trellis",
            sensory_cue: "A garden trellis with a right-angle corner — measure the two legs, square them, and the diagonal is always c²=a²+b².",
          },
          {
            name: "Angle measuring sundial",
            sensory_cue: "Shadow sweeps across the protractor dial — read degrees directly, supplementary angles sharing a straight line in sunlight.",
          },
        ],
      },
      {
        key: "math_coordinate_plane",
        name: "Coordinate Plane",
        icon: "📊",
        subject_family: "math",
        tier: "basic",
        description:
          "Origin intersection, x-axis highway, y-axis elevator, quadrant rooms, slope hill.",
        locations: [
          {
            name: "Origin intersection",
            sensory_cue: "Stand at the perfect (0,0) crossroads — all measurements spread outward from this single reference point in four directions.",
          },
          {
            name: "x-axis highway",
            sensory_cue: "A long horizontal road going positive to the right, negative to the left — every point on it has y=0.",
          },
          {
            name: "y-axis elevator",
            sensory_cue: "An elevator going up to positive infinity and down to negative — every point on it has x=0, perfectly vertical.",
          },
          {
            name: "Quadrant rooms",
            sensory_cue: "Four rooms in each corner: (+,+) sunlit, (−,+) shaded, (−,−) dark basement, (+,−) dimly lit underground.",
          },
          {
            name: "Slope hill",
            sensory_cue: "Walk up the hill — every step right you rise by the slope. Steep hill = large slope; flat hill = slope near zero.",
          },
        ],
      },
      {
        key: "math_algebra_workshop",
        name: "Algebra Workshop",
        icon: "🔢",
        subject_family: "math",
        tier: "basic",
        description:
          "Factoring press, FOIL machine, substitution station, quadratic parabola display, system of equations board.",
        locations: [
          {
            name: "Factoring press",
            sensory_cue: "Feed in x²+5x+6 and the press squeezes out (x+2)(x+3) — two neat factors popping out like pressed bricks.",
          },
          {
            name: "FOIL machine",
            sensory_cue: "A machine with four arms labelled First, Outer, Inner, Last — each arm multiplies its pair, results dropping into a bin.",
          },
          {
            name: "Substitution station",
            sensory_cue: "Replace x with a number from the locker — the expression becomes a pure arithmetic calculation, suddenly solvable.",
          },
          {
            name: "Quadratic parabola display",
            sensory_cue: "A curved arc lit up on a screen — the vertex at the turning point, roots where the arc crosses the x-axis.",
          },
          {
            name: "System of equations board",
            sensory_cue: "Two lines cross at exactly one point on a grid — the intersection coordinates are the simultaneous solution to both equations.",
          },
        ],
      },
      {
        key: "math_number_line",
        name: "Number Line Path",
        icon: "🔁",
        subject_family: "math",
        tier: "basic",
        description:
          "Integer stepping stones, fraction bridge, irrational number fog, absolute value mirror, number set zones.",
        locations: [
          {
            name: "Integer stepping stones",
            sensory_cue: "Hop from stone to stone: …−3, −2, −1, 0, 1, 2, 3… — whole numbers only, perfectly spaced, no gaps allowed.",
          },
          {
            name: "Fraction bridge",
            sensory_cue: "A bridge with infinitely many planks between 0 and 1 — every rational number has its own plank, dense as wood grain.",
          },
          {
            name: "Irrational number fog",
            sensory_cue: "A mysterious fog bank hides √2, π, and e — real numbers with infinite non-repeating decimals, no fraction can locate them.",
          },
          {
            name: "Absolute value mirror",
            sensory_cue: "Walk negative to the mirror and see a positive reflection — distance from zero, always positive, direction erased.",
          },
          {
            name: "Number set zones",
            sensory_cue: "Concentric zones: naturals inside integers inside rationals inside reals — each zone containing the last, growing outward.",
          },
        ],
      },
      {
        key: "math_probability_casino",
        name: "Probability Casino",
        icon: "🎲",
        subject_family: "math",
        tier: "basic",
        description:
          "Sample space table, event roulette, conditional probability door, combinations wheel, expected value cashier.",
        locations: [
          {
            name: "Sample space table",
            sensory_cue: "A table listing every possible outcome of rolling two dice — 36 squares, each one equally likely, all outcomes visible.",
          },
          {
            name: "Event roulette",
            sensory_cue: "The roulette wheel is divided — the size of the sector equals the probability, larger events commanding wider arcs.",
          },
          {
            name: "Conditional probability door",
            sensory_cue: "The door shrinks the universe: given you already know one thing happened, only the relevant outcomes remain on the table.",
          },
          {
            name: "Combinations wheel",
            sensory_cue: "Choose 3 from 10 without caring about order — the wheel counts the unique groupings, ignoring which order you picked.",
          },
          {
            name: "Expected value cashier",
            sensory_cue: "Multiply each prize by its probability and add them — the cashier's total tells you the fair long-run average payout.",
          },
        ],
      },
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // history — History & Geography (6 palaces)
    // ─────────────────────────────────────────────────────────────────────────
    history: [
      {
        key: "hist_museum",
        name: "History Museum",
        icon: "🏛️",
        subject_family: "history",
        tier: "basic",
        description:
          "Ancient civilisations wing, medieval hall, revolution gallery, modern era room, map room.",
        locations: [
          {
            name: "Ancient civilisations wing",
            sensory_cue: "Stone tablets, clay seals, and faded papyrus — the smell of old dust and the weight of 5,000 years of human effort.",
          },
          {
            name: "Medieval hall",
            sensory_cue: "A suit of armour stands guard; faded tapestries narrate battles; the creak of old wood floors underfoot.",
          },
          {
            name: "Revolution gallery",
            sensory_cue: "Revolutionary pamphlets pinned to the wall, ink still smelling sharp — voices of the crowd captured in frozen print.",
          },
          {
            name: "Modern era room",
            sensory_cue: "Photos, telegrams, and early film reels fill the cases — the 20th century unfolding in vivid black-and-white.",
          },
          {
            name: "Map room",
            sensory_cue: "A globe spins in the centre; old maps on every wall show borders shifting like puzzle pieces through the centuries.",
          },
        ],
      },
      {
        key: "hist_timeline_archive",
        name: "Timeline Archive",
        icon: "📜",
        subject_family: "history",
        tier: "basic",
        description:
          "BC era scrolls, AD era drawers, turning-points cabinet, cause-effect chain, primary sources vault.",
        locations: [
          {
            name: "BC era scrolls",
            sensory_cue: "Unroll a papyrus scroll — empires rise and fall in elegant ancient script, dates counting backward into deep history.",
          },
          {
            name: "AD era drawers",
            sensory_cue: "Each drawer holds a century — open the 1400s and out spill the Renaissance, printing press, and Ottoman expansion.",
          },
          {
            name: "Turning-points cabinet",
            sensory_cue: "A red-framed cabinet labelled 'History pivoted here' — inside, events that changed everything: wars, inventions, treaties.",
          },
          {
            name: "Cause-effect chain",
            sensory_cue: "A chain of metal links hangs from ceiling to floor — each link an event, each linked to the next with iron necessity.",
          },
          {
            name: "Primary sources vault",
            sensory_cue: "Sealed glass cases hold handwritten letters, original decrees, and eyewitness diaries — the past speaking in its own voice.",
          },
        ],
      },
      {
        key: "hist_battlefield",
        name: "Battlefield Map",
        icon: "⚔️",
        subject_family: "history",
        tier: "basic",
        description:
          "Strategic high ground, supply line road, troop formation field, command post hill, aftermath memorial.",
        locations: [
          {
            name: "Strategic high ground",
            sensory_cue: "Stand on the hilltop — from here you command the whole plain, see the enemy's movements, and direct your forces below.",
          },
          {
            name: "Supply line road",
            sensory_cue: "A dusty road stretching to the horizon — cut this and the army starves; armies have fallen for neglecting their supply.",
          },
          {
            name: "Troop formation field",
            sensory_cue: "Rows of soldiers in tight formation — their arrangement is a tactical choice, each formation a different trade of offence for defence.",
          },
          {
            name: "Command post hill",
            sensory_cue: "A tent on a raised knoll — maps spread on a table, messengers arriving and departing, every decision made here rippling outward.",
          },
          {
            name: "Aftermath memorial",
            sensory_cue: "Silence after the battle — names carved in stone, flags at half-mast, the human cost made permanently visible in carved marble.",
          },
        ],
      },
      {
        key: "hist_royal_court",
        name: "Royal Court",
        icon: "👑",
        subject_family: "history",
        tier: "basic",
        description:
          "Throne room, ambassador's hall, royal treasury, council chamber, proclamation balcony.",
        locations: [
          {
            name: "Throne room",
            sensory_cue: "The golden throne at the far end of a cavernous hall — the ruler's seat symbolising absolute power over the realm.",
          },
          {
            name: "Ambassador's hall",
            sensory_cue: "Foreign dignitaries wait nervously — alliances sealed with handshakes, wars averted with careful diplomatic phrases.",
          },
          {
            name: "Royal treasury",
            sensory_cue: "Gold coins, tax ledgers, and trading licenses stacked in chests — wealth flowing in from trade routes, wars, and taxation.",
          },
          {
            name: "Council chamber",
            sensory_cue: "Advisors seated around a heavy oak table — competing interests debated, policy shaped by persuasion and power.",
          },
          {
            name: "Proclamation balcony",
            sensory_cue: "The ruler steps out — the crowd below hushes; a new law is declared that will reshape thousands of ordinary lives.",
          },
        ],
      },
      {
        key: "hist_marketplace",
        name: "Ancient Marketplace",
        icon: "🏺",
        subject_family: "history",
        tier: "basic",
        description:
          "Merchant stall row, barter exchange table, trade-route map, currency booth, craft guild workshop.",
        locations: [
          {
            name: "Merchant stall row",
            sensory_cue: "Shouting vendors, spice aromas, silk bolts, and clay pots — the ancient economy alive in a cacophony of commerce.",
          },
          {
            name: "Barter exchange table",
            sensory_cue: "Grain traded for pottery, livestock for tools — before money, every transaction required negotiating equal worth directly.",
          },
          {
            name: "Trade-route map",
            sensory_cue: "A painted map on a canvas — the Silk Road threading through deserts and mountains, connecting civilisations across continents.",
          },
          {
            name: "Currency booth",
            sensory_cue: "Coins clinking behind a wooden counter — silver drachmas, gold dinars, and bronze coins, each stamped with a ruler's face.",
          },
          {
            name: "Craft guild workshop",
            sensory_cue: "Apprentices and masters working side by side — the guild system controlling quality, prices, and who could practice the trade.",
          },
        ],
      },
      {
        key: "hist_time_capsule",
        name: "Time Capsule Vault",
        icon: "🕰️",
        subject_family: "history",
        tier: "basic",
        description:
          "Sealed capsule room, century comparison display, newspaper archive, photograph wall, artefact restoration bench.",
        locations: [
          {
            name: "Sealed capsule room",
            sensory_cue: "A steel cylinder buried in 1900 — crack it open and everyday objects of that era spill out, time made tangible.",
          },
          {
            name: "Century comparison display",
            sensory_cue: "Side-by-side panels show the same city in 1850 and 1950 — the pace of change visible in the shift from cobblestones to tarmac.",
          },
          {
            name: "Newspaper archive",
            sensory_cue: "Yellowed front pages in frames: headlines of wars, elections, disasters — history recorded the same day it was made.",
          },
          {
            name: "Photograph wall",
            sensory_cue: "Sepia faces stare back — ordinary people frozen mid-gesture, the fashion, tools, and backgrounds dating them precisely.",
          },
          {
            name: "Artefact restoration bench",
            sensory_cue: "A conservator's magnifying glass, brushes, and tiny scalpels — each object tells a story when its grime is gently removed.",
          },
        ],
      },
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // lang — Languages & Literature (6 palaces)
    // ─────────────────────────────────────────────────────────────────────────
    lang: [
      {
        key: "lang_story_room",
        name: "Story Room",
        icon: "📖",
        subject_family: "lang",
        tier: "basic",
        description:
          "Narrative arc wall, character portraits, setting diorama, conflict knot, resolution window.",
        locations: [
          {
            name: "Narrative arc wall",
            sensory_cue: "A long curved wall painted with a story's shape — exposition, rising action climbing steeply, climax at the peak.",
          },
          {
            name: "Character portraits",
            sensory_cue: "Framed portraits with personality notes below — protagonist, antagonist, foil — each face hinting at their inner conflict.",
          },
          {
            name: "Setting diorama",
            sensory_cue: "A three-dimensional miniature of the story world — time period, location, and atmosphere captured in exquisite detail.",
          },
          {
            name: "Conflict knot",
            sensory_cue: "A thick rope twisted into a knot hanging from the ceiling — man vs man, man vs nature, man vs self, each strand a type.",
          },
          {
            name: "Resolution window",
            sensory_cue: "A window looking out on a calm landscape — the story's tension fully released, the characters' fates settled and clear.",
          },
        ],
      },
      {
        key: "lang_grammar_hall",
        name: "Grammar Debate Hall",
        icon: "🗣️",
        subject_family: "lang",
        tier: "basic",
        description:
          "Parts-of-speech podium, tense timeline stage, clause construction table, punctuation gallery, syntax tree display.",
        locations: [
          {
            name: "Parts-of-speech podium",
            sensory_cue: "A speaker at the podium declares: noun, verb, adjective, adverb — each word playing its assigned grammatical role precisely.",
          },
          {
            name: "Tense timeline stage",
            sensory_cue: "A stage with past left, present centre, future right — actors move between zones to show when the action happens.",
          },
          {
            name: "Clause construction table",
            sensory_cue: "Build a sentence like LEGO — main clause as a base, subordinate clauses clicking on as useful extensions.",
          },
          {
            name: "Punctuation gallery",
            sensory_cue: "Giant punctuation marks on pedestals: the comma as a brief pause, the colon as a dramatic announcement, the dash as a tangent.",
          },
          {
            name: "Syntax tree display",
            sensory_cue: "A branching diagram on a whiteboard — every sentence broken into its hierarchical grammar structure like a family tree.",
          },
        ],
      },
      {
        key: "lang_library_wing",
        name: "Library Wing",
        icon: "📚",
        subject_family: "lang",
        tier: "basic",
        description:
          "Genre classification shelves, literary device cabinet, author biography wall, vocabulary workshop, critical essay desk.",
        locations: [
          {
            name: "Genre classification shelves",
            sensory_cue: "Novels sorted by genre: mystery, romance, sci-fi, satire — each shelf a different emotional promise for the reader.",
          },
          {
            name: "Literary device cabinet",
            sensory_cue: "Tiny drawers labelled metaphor, simile, alliteration, irony — open each to find an example card with a perfect sentence.",
          },
          {
            name: "Author biography wall",
            sensory_cue: "Black-and-white photos and birth dates — each author's life context illuminating why they wrote what they wrote.",
          },
          {
            name: "Vocabulary workshop",
            sensory_cue: "Root words painted on the floor like tiles — build words outward with prefixes and suffixes, each combo with a new meaning.",
          },
          {
            name: "Critical essay desk",
            sensory_cue: "A desk with a blank sheet — thesis at the top, evidence in the middle, conclusion at the bottom, argument structured perfectly.",
          },
        ],
      },
      {
        key: "lang_theater_stage",
        name: "Theater Stage",
        icon: "🎭",
        subject_family: "lang",
        tier: "basic",
        description:
          "Soliloquy spotlight, dialogue exchange platform, dramatic irony balcony, stage direction wing, audience reaction meter.",
        locations: [
          {
            name: "Soliloquy spotlight",
            sensory_cue: "A single bright light on the actor alone — they speak their inner thoughts aloud, sharing secrets the other characters can't hear.",
          },
          {
            name: "Dialogue exchange platform",
            sensory_cue: "Two actors facing each other on a raised platform — every line of dialogue reveals character, advances plot, or creates tension.",
          },
          {
            name: "Dramatic irony balcony",
            sensory_cue: "From the balcony you see what the character on stage cannot — you know the danger, they don't, and the tension is exquisite.",
          },
          {
            name: "Stage direction wing",
            sensory_cue: "The prompt scripts in the wing have bracketed instructions in italics — [enters laughing], [pauses], [turns away slowly].",
          },
          {
            name: "Audience reaction meter",
            sensory_cue: "A dial backstage tracks the audience's emotional state — laughter, tears, silence, gasps — the playwright's ultimate feedback.",
          },
        ],
      },
      {
        key: "lang_word_garden",
        name: "Word Garden",
        icon: "🌸",
        subject_family: "lang",
        tier: "basic",
        description:
          "Etymology root bed, synonym grove, antonym mirror pond, idiom hedge maze, word family tree.",
        locations: [
          {
            name: "Etymology root bed",
            sensory_cue: "Latin and Greek roots planted like seeds — 'bio' grows into biology, biography, biome, each root spawning a word family.",
          },
          {
            name: "Synonym grove",
            sensory_cue: "Nearby trees with similar but different fruit — 'happy', 'joyful', 'elated' share the grove but each carries its own shade of meaning.",
          },
          {
            name: "Antonym mirror pond",
            sensory_cue: "Every word reflected as its opposite in the still water — 'light' reflects 'dark', 'fast' reflects 'slow' with perfect clarity.",
          },
          {
            name: "Idiom hedge maze",
            sensory_cue: "Phrases that make no literal sense but everyone understands — 'kick the bucket', 'raining cats and dogs' — cultural shortcuts to meaning.",
          },
          {
            name: "Word family tree",
            sensory_cue: "A grand oak with 'act' as the trunk — branches holding actor, action, active, activate, each related but grammatically distinct.",
          },
        ],
      },
      {
        key: "lang_dialogue_cafe",
        name: "Dialogue Café",
        icon: "☕",
        subject_family: "lang",
        tier: "basic",
        description:
          "Formal register table, informal corner booth, debate counter, persuasive speech podium, listening comprehension bar.",
        locations: [
          {
            name: "Formal register table",
            sensory_cue: "White tablecloth, careful word choice — every sentence polished and precise, tone measured for professional or academic use.",
          },
          {
            name: "Informal corner booth",
            sensory_cue: "Comfortable and casual — contractions welcome, slang allowed, the easy rhythm of genuine everyday conversation.",
          },
          {
            name: "Debate counter",
            sensory_cue: "Two stools on opposite sides — argument and counter-argument traded across the counter, evidence cited with each claim.",
          },
          {
            name: "Persuasive speech podium",
            sensory_cue: "Ethos, pathos, logos chalked on the wall — the speaker stands at the podium weaving all three into a single compelling argument.",
          },
          {
            name: "Listening comprehension bar",
            sensory_cue: "Headphones at the bar, audio playing softly — focus on the main idea, supporting details, and the speaker's tone and purpose.",
          },
        ],
      },
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // art — Art & Music (6 palaces)
    // ─────────────────────────────────────────────────────────────────────────
    art: [
      {
        key: "art_gallery",
        name: "Art Gallery",
        icon: "🖼️",
        subject_family: "art",
        tier: "basic",
        description:
          "Composition corner, colour theory wall, perspective corridor, texture study alcove, style comparison display.",
        locations: [
          {
            name: "Composition corner",
            sensory_cue: "Rule of thirds grid etched on the floor — place the subject at an intersection and feel the inherent visual balance.",
          },
          {
            name: "Colour theory wall",
            sensory_cue: "A spinning colour wheel — complementary colours vibrate against each other, analogous colours hum in gentle harmony.",
          },
          {
            name: "Perspective corridor",
            sensory_cue: "Lines race to a vanishing point at the end of a long hallway — depth created on a flat surface through mathematical precision.",
          },
          {
            name: "Texture study alcove",
            sensory_cue: "Touch panels of rough impasto, smooth glaze, and grainy watercolour paper — the eye can read texture before the hand confirms it.",
          },
          {
            name: "Style comparison display",
            sensory_cue: "Impressionist next to Cubist next to Realist — the same subject rendered three ways, the artist's style the lens on reality.",
          },
        ],
      },
      {
        key: "art_color_studio",
        name: "Color Studio",
        icon: "🎨",
        subject_family: "art",
        tier: "basic",
        description:
          "Primary colour mixing table, value gradient wall, warm-cool contrast shelf, pigment origin display, hue saturation dial.",
        locations: [
          {
            name: "Primary colour mixing table",
            sensory_cue: "Red, blue, and yellow sit in separate wells — mix them pairwise and watch orange, green, and violet emerge like magic.",
          },
          {
            name: "Value gradient wall",
            sensory_cue: "A long strip from pure white to pure black — ten steps of grey showing how value defines form and creates illusion of light.",
          },
          {
            name: "Warm-cool contrast shelf",
            sensory_cue: "Warm reds and oranges advance toward you; cool blues and greens recede — temperature creates the illusion of depth.",
          },
          {
            name: "Pigment origin display",
            sensory_cue: "Lapis lazuli ground to ultramarine blue; burnt ochre dug from the earth — every colour once a material harvested from nature.",
          },
          {
            name: "Hue saturation dial",
            sensory_cue: "Turn the dial and watch a vivid red lose its intensity, graying toward neutral — saturation is a colour's purity and punch.",
          },
        ],
      },
      {
        key: "art_sculpture_garden",
        name: "Sculpture Garden",
        icon: "🗿",
        subject_family: "art",
        tier: "basic",
        description:
          "Additive form station, subtractive carving bench, negative space frame, material choice display, scale comparison path.",
        locations: [
          {
            name: "Additive form station",
            sensory_cue: "Clay being built up in layers — each addition changing the silhouette, the sculpture growing outward from a wire armature.",
          },
          {
            name: "Subtractive carving bench",
            sensory_cue: "A chisel strikes marble with a ringing crack — the sculptor removing everything that isn't the form, revealing what was always inside.",
          },
          {
            name: "Negative space frame",
            sensory_cue: "A bronze sculpture of a figure but the space around it is painted — negative space as expressive as the solid form itself.",
          },
          {
            name: "Material choice display",
            sensory_cue: "Bronze, stone, wood, found objects — each material with its own weight, texture, permanence, and cultural resonance.",
          },
          {
            name: "Scale comparison path",
            sensory_cue: "A path from a thumbnail sketch to a monumental 10-metre figure — scale changes how we feel in relationship to the work.",
          },
        ],
      },
      {
        key: "art_music_hall",
        name: "Music Hall",
        icon: "🎵",
        subject_family: "art",
        tier: "basic",
        description:
          "Rhythm percussion stage, melody instrument row, harmony chord circle, dynamics control panel, notation score wall.",
        locations: [
          {
            name: "Rhythm percussion stage",
            sensory_cue: "Drums, claves, and tambourines — the heartbeat of music, the repeating pattern of stressed and unstressed beats you feel in your chest.",
          },
          {
            name: "Melody instrument row",
            sensory_cue: "Flute, violin, piano keys — the singing line that your brain remembers long after the concert ends, the tune you hum.",
          },
          {
            name: "Harmony chord circle",
            sensory_cue: "Three notes played together — consonant chords feel resolved and warm; dissonant chords create tension that demands resolution.",
          },
          {
            name: "Dynamics control panel",
            sensory_cue: "A mixing desk with faders from pianissimo to fortissimo — the volume and intensity that give a performance its emotional shape.",
          },
          {
            name: "Notation score wall",
            sensory_cue: "A giant printed score — treble and bass clef staves carrying black dots, each precisely indicating pitch, duration, and expression.",
          },
        ],
      },
      {
        key: "art_architecture_museum",
        name: "Architecture Museum",
        icon: "🏗️",
        subject_family: "art",
        tier: "basic",
        description:
          "Structural system models, façade style gallery, proportion measurement hall, material innovation lab, urban context map.",
        locations: [
          {
            name: "Structural system models",
            sensory_cue: "Scale models of arches, columns, vaults, and steel frames — each system transferring load to the ground differently.",
          },
          {
            name: "Façade style gallery",
            sensory_cue: "Gothic pointed arches beside Baroque ornament beside Modernist glass curtain — each style a reflection of its era's values.",
          },
          {
            name: "Proportion measurement hall",
            sensory_cue: "The golden ratio marked in tape on the floor — a rectangle whose proportions feel instinctively perfect to the human eye.",
          },
          {
            name: "Material innovation lab",
            sensory_cue: "Concrete, glass, steel, timber, carbon fibre — each material expanding what was possible, allowing new forms to emerge.",
          },
          {
            name: "Urban context map",
            sensory_cue: "A birds-eye map of the city — no building exists alone; scale, setback, and streetline connect every structure to its neighbours.",
          },
        ],
      },
      {
        key: "art_pattern_workshop",
        name: "Pattern Workshop",
        icon: "🔷",
        subject_family: "art",
        tier: "basic",
        description:
          "Symmetry mirror table, tessellation floor, motif carving block, rhythm repeat wall, cultural textile display.",
        locations: [
          {
            name: "Symmetry mirror table",
            sensory_cue: "A half-design placed against the mirror — perfect bilateral symmetry reflected, the whole emerging from just one side.",
          },
          {
            name: "Tessellation floor",
            sensory_cue: "Interlocking tiles cover the entire floor without gaps — Escher-like shapes fitting together in endlessly repeating patterns.",
          },
          {
            name: "Motif carving block",
            sensory_cue: "A carved stamp dipped in ink — press, lift, shift, press again — a single motif becoming an infinite repeating design.",
          },
          {
            name: "Rhythm repeat wall",
            sensory_cue: "Shapes alternating at a steady interval — the eye moves rhythmically across the wall, pattern creating visual music.",
          },
          {
            name: "Cultural textile display",
            sensory_cue: "Ikat, kilim, and batik fabrics hung side by side — traditional patterns encoding cultural identity in thread and dye.",
          },
        ],
      },
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // universal — always appended to every subject's picker (4 palaces)
    // ─────────────────────────────────────────────────────────────────────────
    universal: [
      {
        key: "home",
        name: "Student's Home",
        icon: "🏠",
        subject_family: "universal",
        tier: "basic",
        description:
          "Front door, kitchen counter, living room sofa, bedroom study desk, balcony plant shelf.",
        locations: [
          {
            name: "Front door",
            sensory_cue: "Hear the key turning in the lock — the familiar click, the creak of the door, the smell of home rushing out to meet you.",
          },
          {
            name: "Kitchen counter",
            sensory_cue: "Smell warm bread and sweet tea — the counter where mornings begin, textbooks sometimes stacked beside the fruit bowl.",
          },
          {
            name: "Living room sofa",
            sensory_cue: "Feel the soft cushions sink under your weight — the living room's centre of gravity, family gathered, television murmuring.",
          },
          {
            name: "Bedroom study desk",
            sensory_cue: "See your books, lamp, and pencil case arranged under the warm pool of light — this is where ideas become knowledge.",
          },
          {
            name: "Balcony plant shelf",
            sensory_cue: "Cool air and the smell of damp soil near the window — green leaves catching the morning light in quiet, patient rows.",
          },
        ],
      },
      {
        key: "school",
        name: "School",
        icon: "🏫",
        subject_family: "universal",
        tier: "basic",
        description:
          "School entrance gate, classroom, library reading corner, science lab, school canteen.",
        locations: [
          {
            name: "School entrance gate",
            sensory_cue: "The clang of the bell, a rush of students, backpacks bouncing — the gate marks the transition from home to learning.",
          },
          {
            name: "Classroom",
            sensory_cue: "Chalk dust in the air, rows of desks, the teacher's voice filling the room — the place where most of learning happens.",
          },
          {
            name: "Library reading corner",
            sensory_cue: "Hushed and cool, the smell of old paper — shelves stretching upward, a beanbag on the floor, the world accessible in pages.",
          },
          {
            name: "Science lab",
            sensory_cue: "Bunsen burners hissing, safety goggles on — the thrill of seeing a reaction happen, theory becoming visible reality.",
          },
          {
            name: "School canteen",
            sensory_cue: "The clatter of trays, the smell of warm food — conversations between mouthfuls, the social hub of the school day.",
          },
        ],
      },
      {
        key: "neighborhood_park",
        name: "Neighborhood Park",
        icon: "🌳",
        subject_family: "universal",
        tier: "basic",
        description:
          "Park entrance bench, central fountain, children's play area, winding path, quiet reading tree.",
        locations: [
          {
            name: "Park entrance bench",
            sensory_cue: "An old wooden bench by the gate — the first seat after the street, where you adjust to the park's slower, greener pace.",
          },
          {
            name: "Central fountain",
            sensory_cue: "The sound of splashing water draws you in — pigeons perch on the rim, children run circles around the basin.",
          },
          {
            name: "Children's play area",
            sensory_cue: "Bright primary-colour equipment, the squeak of swings, laughter — full of kinetic energy even when empty.",
          },
          {
            name: "Winding path",
            sensory_cue: "A gravel path curving through the park — dappled shade, the crunch of each footstep, a leisurely route connecting everything.",
          },
          {
            name: "Quiet reading tree",
            sensory_cue: "A spreading oak at the far end — grass cool and soft beneath it, the noise of the city muffled, perfect for solitary thought.",
          },
        ],
      },
      {
        key: "city_library",
        name: "City Library",
        icon: "🏙️",
        subject_family: "universal",
        tier: "basic",
        description:
          "Information desk, reference stacks, periodical reading room, digital research terminal, rooftop study terrace.",
        locations: [
          {
            name: "Information desk",
            sensory_cue: "A helpful librarian at the central desk — the gateway to knowing where anything is, authoritative but approachable.",
          },
          {
            name: "Reference stacks",
            sensory_cue: "Tall, close-set shelves receding into dim distance — encyclopaedias, atlases, and dictionaries radiating organised knowledge.",
          },
          {
            name: "Periodical reading room",
            sensory_cue: "Newspapers on wooden rods, magazines in deep armchairs — today's knowledge and last century's on the same reading table.",
          },
          {
            name: "Digital research terminal",
            sensory_cue: "A glowing screen in a quiet carrel — access to global databases, academic journals, and digitised archives at your fingertips.",
          },
          {
            name: "Rooftop study terrace",
            sensory_cue: "Open sky above, city sounds below, a table and chairs — studying here connects knowledge to the world it belongs to.",
          },
        ],
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // getCatalogForSubject(subject) -> Palace[]
  // Returns subject-specific palaces + universal palaces appended.
  // If subject resolves to "universal", returns ONLY universal palaces.
  // ---------------------------------------------------------------------------

  function getCatalogForSubject(subject) {
    const family = subjectFamilyFor(subject);
    if (family === "universal") {
      return PALACE_LIBRARY.universal.slice();
    }
    const subjectPalaces = PALACE_LIBRARY[family] || [];
    return subjectPalaces.concat(PALACE_LIBRARY.universal);
  }

  // ---------------------------------------------------------------------------
  // scaffoldFor(context) -> { palaces: Palace[], concepts: Concept[] }
  // Returns first 4 palaces from the resolved catalog as the default selection,
  // plus 5 empty concept slots.
  // ---------------------------------------------------------------------------

  function scaffoldFor(context) {
    const ctx = context && typeof context === "object" ? context : {};
    const catalog = getCatalogForSubject(ctx.subject);
    const palaces = catalog.slice(0, 4).map(function (p) {
      return JSON.parse(JSON.stringify(p));
    });
    const concepts = [
      { id: "mp-c1", term: "", description: "", image_cue: "" },
      { id: "mp-c2", term: "", description: "", image_cue: "" },
      { id: "mp-c3", term: "", description: "", image_cue: "" },
      { id: "mp-c4", term: "", description: "", image_cue: "" },
      { id: "mp-c5", term: "", description: "", image_cue: "" },
    ];
    return { palaces: palaces, concepts: concepts };
  }

  // ---------------------------------------------------------------------------
  // ensureConceptId(concept, idx) -> string
  // Returns concept.id if non-empty, otherwise "mp-c<idx+1>".
  // ---------------------------------------------------------------------------

  function ensureConceptId(concept, idx) {
    if (concept && typeof concept.id === "string" && concept.id.trim()) {
      return concept.id;
    }
    return "mp-c" + (idx + 1);
  }

  // ---------------------------------------------------------------------------
  // validatePalace(palace) -> { ok: bool, errors: string[] }
  // ---------------------------------------------------------------------------

  function validatePalace(palace) {
    const errors = [];
    const p = palace && typeof palace === "object" ? palace : {};

    if (!p.key || !String(p.key).trim()) {
      errors.push("Palace key is required.");
    }
    if (!p.name || !String(p.name).trim()) {
      errors.push("Palace name is required.");
    }
    const locs = Array.isArray(p.locations) ? p.locations : [];
    if (locs.length !== 5) {
      errors.push("Palace must have exactly 5 locations (got " + locs.length + ").");
    }
    locs.forEach(function (loc, i) {
      const n = loc && typeof loc.name === "string" ? loc.name.trim() : "";
      if (!n) {
        errors.push("Location " + (i + 1) + " name is required.");
      }
    });

    return { ok: errors.length === 0, errors: errors };
  }

  // ---------------------------------------------------------------------------
  // validateConcept(concept) -> { ok: bool, errors: string[] }
  // ---------------------------------------------------------------------------

  function validateConcept(concept) {
    const errors = [];
    const c = concept && typeof concept === "object" ? concept : {};
    const term = typeof c.term === "string" ? c.term.trim() : "";
    if (!term) {
      errors.push("Concept term is required.");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  // ---------------------------------------------------------------------------
  // validateGame(game) -> { ok: bool, errors: string[] }
  // Aggregates per-palace + per-concept errors. Checks min counts + uniqueness.
  // ---------------------------------------------------------------------------

  function validateGame(game) {
    const errors = [];
    const g = game && typeof game === "object" ? game : {};
    const palaces = Array.isArray(g.palaces) ? g.palaces : [];
    const concepts = Array.isArray(g.concepts) ? g.concepts : [];

    if (palaces.length < 4) {
      errors.push("At least 4 palaces are required (got " + palaces.length + ").");
    }
    if (concepts.length < 3) {
      errors.push("At least 3 concepts are required (got " + concepts.length + ").");
    }

    // Palace key uniqueness
    const palaceKeys = palaces.map(function (p) {
      return p && p.key ? String(p.key) : "";
    });
    const seenKeys = {};
    palaceKeys.forEach(function (k, i) {
      if (k) {
        if (seenKeys[k] !== undefined) {
          errors.push("Duplicate palace key '" + k + "' at position " + (i + 1) + ".");
        } else {
          seenKeys[k] = i;
        }
      }
    });

    // Concept id uniqueness (auto-fill first)
    const conceptIds = concepts.map(function (c, i) {
      return ensureConceptId(c, i);
    });
    const seenIds = {};
    conceptIds.forEach(function (id, i) {
      if (seenIds[id] !== undefined) {
        errors.push("Duplicate concept id '" + id + "' at position " + (i + 1) + ".");
      } else {
        seenIds[id] = i;
      }
    });

    // Per-palace validation
    palaces.forEach(function (palace, i) {
      const result = validatePalace(palace);
      if (!result.ok) {
        result.errors.forEach(function (e) {
          errors.push("Palace " + (i + 1) + ": " + e);
        });
      }
    });

    // Per-concept validation
    concepts.forEach(function (concept, i) {
      const result = validateConcept(concept);
      if (!result.ok) {
        result.errors.forEach(function (e) {
          errors.push("Concept " + (i + 1) + ": " + e);
        });
      }
    });

    return { ok: errors.length === 0, errors: errors };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const api = {
    subjectFamilyFor: subjectFamilyFor,
    gradeBandFor: gradeBandFor,
    PALACE_LIBRARY: PALACE_LIBRARY,
    getCatalogForSubject: getCatalogForSubject,
    scaffoldFor: scaffoldFor,
    ensureConceptId: ensureConceptId,
    validatePalace: validatePalace,
    validateConcept: validateConcept,
    validateGame: validateGame,
  };

  if (typeof window !== "undefined") {
    window.MemoryPalaceHelpers = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();

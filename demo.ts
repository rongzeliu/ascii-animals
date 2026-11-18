import { mountTweakPanel, type Control, type ControlKit } from "./panel";
import { ANIMAL_KEYS, ANIMALS, AnimalEngine, SHARED_CONTROLS, type AnimalKey, type KnobSpec, type Tuning } from "./src";
import { mountChoices, mountComposer, mountGreeting } from "./ui";

/**
 * Prefix for everything this app keeps in localStorage. It shares a domain with the older
 * butterflies app (Pocket Studio, /butterflies-app), which uses bare "tweaks" and "animal".
 */
const STORE = "ascii-animals:";

const params = new URLSearchParams(location.search);

// ?animal=koi picks the animal (otherwise the last one picked); ?count=60 pins how many. No count: sized to the screen.
const count = Number(params.get("count")) || undefined;
const isAnimal = (key: string | null): key is AnimalKey => key !== null && key in ANIMALS;
let saved: string | null = null;
try {
  saved = localStorage.getItem(STORE + "animal");
} catch {
  // Storage unavailable: start with butterflies.
}
let animal: AnimalKey = isAnimal(params.get("animal")) ? (params.get("animal") as AnimalKey) : isAnimal(saved) ? saved : "butterflies";

// Dark mode only: every animal is tuned to glow on black.
const engine = new AnimalEngine(document.querySelector("canvas")!, { animal, count, theme: "dark" });

// ── tweak panel: shared Movement and Look knobs around the animal's own ──

/** Each animal's tweaks are saved under their own key. */
const storageKey = (key: AnimalKey) => `${STORE}tweaks:${key}`;

function controlsFor(key: AnimalKey) {
  const a = ANIMALS[key];
  const hidden = new Set<string>(a.hide ?? []);
  return (kit: ControlKit<Tuning>): [string, Control[]][] => {
    const build = (spec: KnobSpec): Control => {
      if ("toggle" in spec) return kit.toggle(spec.key, spec.label, spec.hint);
      const knob = kit.knob(spec.key, spec.label, spec.min, spec.max, spec.step, spec.hint);
      const when = spec.disabledWhen;
      return when ? { ...knob, disabled: () => Boolean(engine.tuning[when]) } : knob;
    };
    const keep = (specs: KnobSpec[]) => specs.filter((s) => !hidden.has(s.key)).map(build);
    return [
      ["Movement", keep(SHARED_CONTROLS.movement)],
      ...a.controls.map(([title, specs]): [string, Control[]] => [title, specs.map(build)]),
      ["Look", keep(SHARED_CONTROLS.look)],
    ];
  };
}

let tweaks = mountTweakPanel(engine, ANIMALS[animal].defaults, controlsFor(animal), { storageKey: storageKey(animal) });

interface OverlayState {
  animal: AnimalKey;
  tuning: Tuning;
}

declare global {
  interface Window {
    overlayAPI?: {
      sendState: (state: OverlayState) => void;
      onState: (cb: (state: OverlayState) => void) => () => void;
      requestState: () => void;
      onRequestState: (cb: () => void) => () => void;
      setAnimal: (animal: AnimalKey) => void;
      onSetAnimal: (cb: (animal: AnimalKey) => void) => () => void;
      setKnob: (key: string, value: number | boolean) => void;
      onSetKnob: (cb: (key: string, value: number | boolean) => void) => () => void;
      resetAnimal: () => void;
      onResetAnimal: (cb: () => void) => () => void;
      setVisible: (visible: boolean) => void;
      setInteraction: (enabled: boolean) => void;
      onInteraction: (cb: (enabled: boolean) => void) => () => void;
      onStartle: (cb: (x: number, y: number) => void) => () => void;
      quit: () => void;
    };
  }
}

function selectAnimal(value: AnimalKey) {
  animal = value;
  engine.setAnimal(animal);
  tweaks.destroy();
  tweaks = mountTweakPanel(engine, ANIMALS[animal].defaults, controlsFor(animal), { storageKey: storageKey(animal) });
  try {
    localStorage.setItem(STORE + "animal", animal);
  } catch {
    // Not remembered across visits, that's all.
  }
  window.overlayAPI?.sendState({ animal, tuning: { ...engine.tuning } });
}

if (window.overlayAPI) {
  window.overlayAPI.onRequestState(() => {
    window.overlayAPI?.sendState({ animal, tuning: { ...engine.tuning } });
  });
  window.overlayAPI.onSetAnimal((next) => {
    if (isAnimal(next)) selectAnimal(next);
  });
  window.overlayAPI.onSetKnob((key, value) => {
    engine.set(key, value);
    tweaks.sync();
    window.overlayAPI?.sendState({ animal, tuning: { ...engine.tuning } });
  });
  window.overlayAPI.onResetAnimal(() => {
    const defs = ANIMALS[animal].defaults;
    for (const key of Object.keys(defs)) engine.set(key, defs[key]);
    try {
      localStorage.removeItem(storageKey(animal));
    } catch {
      // Ignore storage errors.
    }
    tweaks.sync();
    window.overlayAPI?.sendState({ animal, tuning: { ...engine.tuning } });
  });
  window.overlayAPI.onStartle((x, y) => {
    engine.startle(x, y);
  });
  window.overlayAPI.sendState({ animal, tuning: { ...engine.tuning } });
}

// Open in two tabs? When the other one saves tweaks for this animal, reload, so this tab never
// writes its stale settings back over the newer ones.
window.addEventListener("storage", (e) => {
  if (e.key === storageKey(animal)) location.reload();
});

// ── animal choices: every animal in the top bar, each with a dot of its own colour ──

mountChoices(
  document.querySelector<HTMLElement>(".choices")!,
  ANIMAL_KEYS.map((key) => ({ value: key, label: ANIMALS[key].label, swatch: `rgb(${ANIMALS[key].swatch.join(",")})` })),
  animal,
  (value) => selectAnimal(value as AnimalKey),
);

mountComposer();
mountGreeting("Stephen");

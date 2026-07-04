// ============================================================================
// opening.ts  —  title card -> how-to-play -> character pick -> Main Street.
// These panels float in front of where you spawn. Finishing the picker drops
// you into Stage 1, where the proximity-gated stage panels take over.
// ============================================================================

import { Interactable, PanelUI } from "@iwsdk/core";
import { COLOR, setChosenCharacter } from "../state";
import { showPhase, registerPhasePanel } from "../phase";
import { setObjective } from "../hud";
import { sfxClick } from "../../sfx";
import type { Ctx } from "../context";
import type { Character, PanelDoc } from "../types";

// The four explorers. Only the name is used in code (for the report greeting);
// the words on the cards live in ui/setup.uikitml.
const CHARACTERS: Character[] = [
  { id: "ada", name: "Ada" },
  { id: "leo", name: "Leo" },
  { id: "mia", name: "Mia" },
  { id: "sam", name: "Sam" },
];

const WELCOME_STEPS = 5;

export function setupOpening(ctx: Ctx): { start: () => void } {
  const { world, panels } = ctx;

  // The title card, floating in front of where you start.
  const titlePanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/title.json", maxWidth: 2.4, maxHeight: 1.6 })
    .addComponent(Interactable);
  titlePanel.object3D!.position.set(0, 1.6, 4);
  titlePanel.object3D!.visible = false;

  // The how-to-play card, in the same spot.
  const welcomePanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/welcome.json", maxWidth: 2.4, maxHeight: 2.0 })
    .addComponent(Interactable);
  welcomePanel.object3D!.position.set(0, 1.6, 4);
  welcomePanel.object3D!.visible = false;

  // The character picker, a little farther in.
  const setupPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/setup.json", maxWidth: 2.6, maxHeight: 2.0 })
    .addComponent(Interactable);
  setupPanel.object3D!.position.set(0, 1.6, 7.2);
  setupPanel.object3D!.visible = false;
  registerPhasePanel("setup", setupPanel);
  panels.registerStoryPanel(setupPanel);

  // Title: Start reveals the how-to-play.
  panels.whenPanelReady(titlePanel, function (doc: PanelDoc) {
    doc.getElementById("start-button")?.setProperties({
      onClick: function () {
        sfxClick();
        titlePanel.object3D!.visible = false;
        welcomePanel.object3D!.visible = true;
      },
    });
  });

  // How to play: five steps, Back / Next, ending by entering Main Street.
  let welcomeStep = 1;
  panels.whenPanelReady(welcomePanel, function (doc: PanelDoc) {
    const GOLD = COLOR.smarts;
    const DISABLED_BG = "#c9c2b5";
    const DISABLED_TEXT = "#7a7a7a";
    const NAVY = COLOR.navy;

    const backButton = doc.getElementById("back-button");
    const backLabel = doc.getElementById("back-label");
    const nextButton = doc.getElementById("next-button");
    const nextLabel = doc.getElementById("next-label");
    const indicator = doc.getElementById("step-indicator");

    function showWelcomeStep(n: number) {
      welcomeStep = n;
      for (let i = 1; WELCOME_STEPS >= i; i = i + 1) {
        doc.getElementById("step-" + i)?.setProperties({ display: i === n ? "flex" : "none" });
      }
      indicator?.setProperties({ text: "Step " + n + " of " + WELCOME_STEPS });
      const onFirst = n === 1;
      backButton?.setProperties({ backgroundColor: onFirst ? DISABLED_BG : GOLD });
      backLabel?.setProperties({ color: onFirst ? DISABLED_TEXT : NAVY });
      const onLast = n === WELCOME_STEPS;
      nextLabel?.setProperties({ text: onLast ? "Start Playing" : "Next" });
    }

    backButton?.setProperties({
      onClick: function () {
        if (welcomeStep > 1) {
          sfxClick();
          showWelcomeStep(welcomeStep - 1);
        }
      },
    });
    nextButton?.setProperties({
      onClick: function () {
        if (WELCOME_STEPS > welcomeStep) {
          sfxClick();
          showWelcomeStep(welcomeStep + 1);
        } else {
          sfxClick();
          welcomePanel.object3D!.visible = false;
          showPhase("setup");
          panels.presentPanel(setupPanel); // place it in front, in case you wandered off
          setObjective("Pick your explorer, then tap Begin.");
        }
      },
    });

    showWelcomeStep(1);
  });

  // Character picker: highlight the chosen card, then Begin drops into Stage 1.
  let chosen: Character | null = null;
  panels.whenPanelReady(setupPanel, function (doc: PanelDoc) {
    const GOLD = COLOR.smarts;
    const NAVY = COLOR.navy;

    const beginButton = doc.getElementById("begin-button");
    const beginLabel = doc.getElementById("begin-label");
    const cards: Record<string, ReturnType<PanelDoc["getElementById"]>> = {};

    function selectCharacter(ch: Character) {
      chosen = ch;
      setChosenCharacter(ch);
      for (const c of CHARACTERS) {
        const card = cards[c.id];
        if (card) card.setProperties({ borderColor: c.id === ch.id ? GOLD : NAVY });
      }
      beginButton?.setProperties({ backgroundColor: GOLD });
      beginLabel?.setProperties({ color: NAVY });
    }

    for (const c of CHARACTERS) {
      const card = doc.getElementById("card-" + c.id);
      cards[c.id] = card;
      card?.setProperties({ onClick: function () { sfxClick(); selectCharacter(c); } });
    }

    beginButton?.setProperties({
      onClick: function () {
        if (!chosen) return; // must pick someone first
        sfxClick();
        setupPanel.object3D!.visible = false;
        showPhase("stage1");
        setObjective("Stroll Main Street and go say hi to Gus.");
      },
    });
  });

  function start() {
    titlePanel.object3D!.visible = true;
    welcomePanel.object3D!.visible = false;
  }

  return { start };
}

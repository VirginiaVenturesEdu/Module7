// ============================================================================
// report.ts  —  the finale. Names the money personality from the CHOICES the
// player actually made (so a spender is never called a saver), greets the
// chosen explorer, fills the three meter bars AND a per-stage money timeline
// (start -> end + the key choice), then a debrief beat with the three questions
// the class reflection asks. A full session summary is logged and saved to
// localStorage for the teacher-facing side of the course.
// ============================================================================

import { Interactable, PanelUI, Vector3 } from "@iwsdk/core";
import { burstConfetti } from "../confetti";
import {
  choices,
  getChosenCharacter,
  getMoney,
  getScores,
  getStageHistory,
} from "../state";
import { showPhase, registerPhasePanel } from "../phase";
import { setObjective } from "../hud";
import { sfxClick, sfxFanfare } from "../../sfx";
import { STATIONS } from "../../environment";
import type { Ctx } from "../context";
import type { PanelDoc, PanelElement, Personality } from "../types";

// The report meter track is 100 wide in the .uikitml, drawn at 0.4 scale, so a
// full meter (100) fills 40 units.
const REPORT_TRACK_WIDTH = 40;
// The timeline bars sit in a 126-wide track (see .tl-bar-bg in the .uikitml).
const TIMELINE_TRACK_WIDTH = 126;

const PERSONALITIES: Record<string, Personality> = {
  bold: {
    name: "Bold Investor",
    blurb: "You love to grow your money and you are not afraid to take a chance. Just remember to keep some savings safe, too!",
  },
  saver: {
    name: "Careful Saver",
    blurb: "You keep your money safe and steady. Saving is a real strength! Try investing a little to help it grow even more.",
  },
  diversifier: {
    name: "Smart Diversifier",
    blurb: "You make smart choices and spread your money around. That is a great way to stay safe and keep growing!",
  },
  balanced: {
    name: "Balanced Builder",
    blurb: "You did a little of everything: spending, saving, and growing. Mixing it up is a great way to learn what works best for you!",
  },
  spender: {
    name: "Free Spender",
    blurb: "You love to enjoy your money right now, and that is okay! Try saving a little for later, too, so you are ready for a surprise.",
  },
};

// Decide the money personality from the choices, most distinctive first.
function personalityKey(): string {
  if (choices.stage3 === "three") return "diversifier"; // spread out in the big decision
  if (choices.stage2 === "lots") return "bold"; // invested almost all of the paycheck
  if (choices.stage1 === "spend") return "spender"; // spent most of the money
  if (choices.stage1 === "safe" || choices.stage2 === "safe") return "saver"; // kept it safe
  return "balanced"; // a steady little of everything
}

// Log a full session summary and stash it in localStorage for the teacher side.
function exportSession(personality: string) {
  const s = getScores();
  const character = getChosenCharacter();
  const timeline = getStageHistory();
  const session = {
    character: character ? character.name : "explorer",
    personality,
    finalMoney: getMoney(),
    meters: { growth: s.growth, security: s.security, smarts: s.smarts },
    choices: { stage1: choices.stage1, stage2: choices.stage2, stage3: choices.stage3 },
    timeline,
    totalSeconds: timeline.reduce(function (sum, r) { return sum + r.seconds; }, 0),
  };
  console.log("[Money Moves] session summary", session);
  try {
    localStorage.setItem("moneyMoves.session", JSON.stringify(session));
  } catch {
    // localStorage may be unavailable (private mode / headset browser) — that's fine.
  }
}

// Read the personality from the PREVIOUS session (saved last time), before this
// run overwrites it, so the report can nudge the student to try something new.
function readLastPersonality(): string {
  try {
    const raw = localStorage.getItem("moneyMoves.session");
    if (!raw) return "";
    const prev = JSON.parse(raw) as { personality?: string };
    return prev.personality || "";
  } catch {
    return "";
  }
}

export function setupReport(ctx: Ctx): { showReport: () => void } {
  const { world, panels } = ctx;
  const lastPersonality = readLastPersonality(); // captured before we export this run

  const panel = world
    .createTransformEntity()
    .addComponent(PanelUI, { config: "./ui/report.json", maxWidth: 2.6, maxHeight: 2.6 })
    .addComponent(Interactable);
  panel.object3D!.position.set(STATIONS.bank.x, 1.6, STATIONS.bank.z + 2.2);
  panel.object3D!.visible = false;
  registerPhasePanel("report", panel);
  panels.registerStoryPanel(panel);

  let doc: PanelDoc | null = null;
  panels.whenPanelReady(panel, function (d: PanelDoc) {
    doc = d;
    const beatMain = d.getElementById("beat-main");
    const beatDebrief = d.getElementById("beat-debrief");
    beatMain?.setProperties({ display: "flex" });
    beatDebrief?.setProperties({ display: "none" });

    d.getElementById("to-debrief-button")?.setProperties({
      onClick: function () {
        sfxClick();
        beatMain?.setProperties({ display: "none" });
        beatDebrief?.setProperties({ display: "flex" });
      },
    });
    d.getElementById("play-again-button")?.setProperties({
      onClick: function () {
        sfxClick();
        window.location.reload(); // a clean, full restart back to the title
      },
    });
  });

  // Fill one timeline row: "Growing Up: $30 -> $27", a bar sized to the money,
  // and the key choice line.
  function fillTimelineRow(n: number, line: PanelElement | null, fill: PanelElement | null, choice: PanelElement | null, maxEnd: number) {
    const history = getStageHistory();
    const rec = history[n - 1];
    if (!rec) {
      line?.setProperties({ text: "" });
      choice?.setProperties({ text: "" });
      fill?.setProperties({ width: 0 });
      return;
    }
    line?.setProperties({ text: rec.title + ": $" + rec.startMoney + " to $" + rec.endMoney });
    choice?.setProperties({ text: rec.keyChoice });
    const w = maxEnd > 0 ? Math.round((rec.endMoney / maxEnd) * TIMELINE_TRACK_WIDTH) : 0;
    fill?.setProperties({ width: w });
  }

  function showReport() {
    const s = getScores();
    const key = personalityKey();
    const p = PERSONALITIES[key];
    const character = getChosenCharacter();
    const name = character ? character.name : "explorer";

    if (doc) {
      doc.getElementById("greeting")?.setProperties({
        text: "Great job, " + name + "!",
        ...(character ? { color: character.accent } : {}),
      });
      doc.getElementById("personality-name")?.setProperties({ text: p.name });

      // Replay nudge: name last time's result (if any) and suggest a new tack.
      const hint = lastPersonality
        ? "Last time you were a " + lastPersonality + ". What happens if you try a different strategy this time?"
        : "Want to try again? See what happens if you spread your money out next time!";
      doc.getElementById("replay-hint")?.setProperties({ text: hint });
      doc.getElementById("personality-blurb")?.setProperties({ text: p.blurb });
      doc.getElementById("value-growth")?.setProperties({ text: String(s.growth) });
      doc.getElementById("value-security")?.setProperties({ text: String(s.security) });
      doc.getElementById("value-smarts")?.setProperties({ text: String(s.smarts) });
      doc.getElementById("fill-growth")?.setProperties({ width: Math.round((s.growth / 100) * REPORT_TRACK_WIDTH) });
      doc.getElementById("fill-security")?.setProperties({ width: Math.round((s.security / 100) * REPORT_TRACK_WIDTH) });
      doc.getElementById("fill-smarts")?.setProperties({ width: Math.round((s.smarts / 100) * REPORT_TRACK_WIDTH) });

      // The money timeline: scale each stage's bar to the biggest end balance.
      const history = getStageHistory();
      const maxEnd = history.reduce(function (m, r) { return Math.max(m, r.endMoney); }, 0);
      fillTimelineRow(1, doc.getElementById("tl-1-line"), doc.getElementById("tl-1-fill"), doc.getElementById("tl-1-choice"), maxEnd);
      fillTimelineRow(2, doc.getElementById("tl-2-line"), doc.getElementById("tl-2-fill"), doc.getElementById("tl-2-choice"), maxEnd);
      fillTimelineRow(3, doc.getElementById("tl-3-line"), doc.getElementById("tl-3-fill"), doc.getElementById("tl-3-choice"), maxEnd);
    }

    exportSession(p.name);
    sfxFanfare();
    showPhase("report");
    panels.presentPanel(panel); // place it comfortably in front, wherever you stand
    setObjective("You did it! Here is your money report.");

    // A little celebration: confetti bursts above the report card.
    const burstPos = new Vector3();
    panel.object3D?.getWorldPosition(burstPos);
    burstPos.y += 0.8;
    burstConfetti(world, burstPos);
  }

  return { showReport };
}

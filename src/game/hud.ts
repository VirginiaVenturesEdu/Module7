// ============================================================================
// hud.ts  —  the top-left browser dashboard (a plain DOM overlay).
// It shows the running money and the three meters, and it subscribes to the
// state module so it redraws itself whenever a number changes. pointerEvents is
// off so it never blocks a click. A headset cannot render the DOM, so the 3D
// scoreboard (scoreboard.ts) mirrors the same data in VR.
// ============================================================================

import { COLOR, getMoney, getScores, onMoney, onObjective, onScore } from "./state";
import type { Meter, Phase } from "./types";

// setObjective lives in state (both dashboards react to it); re-exported here so
// callers that import it from the HUD keep working.
export { setObjective } from "./state";

let hudGrowthValue: HTMLElement | null = null;
let hudSecurityValue: HTMLElement | null = null;
let hudSmartsValue: HTMLElement | null = null;
let hudGrowthFill: HTMLElement | null = null;
let hudSecurityFill: HTMLElement | null = null;
let hudSmartsFill: HTMLElement | null = null;
let hudStageChip: HTMLElement | null = null;
let hudObjective: HTMLElement | null = null;
let hudRoot: HTMLElement | null = null;
let hudCharacter: HTMLElement | null = null;

// Show the chosen explorer's name in their accent color, and tint the HUD
// border to match, so the character pick is visible while you play.
export function setCharacter(name: string, accent: string) {
  if (hudCharacter) {
    hudCharacter.textContent = "★ " + name;
    hudCharacter.style.color = accent;
    hudCharacter.style.display = "block";
  }
  if (hudRoot) hudRoot.style.borderColor = accent;
}

let moneyRowEl: HTMLElement | null = null;
let moneyValueEl: HTMLElement | null = null;
let hudDisplayedMoney = 0; // what the HUD is currently showing, for animation

function makeHudMeter(label: string, barColor: string, textColor: string) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.marginBottom = "7px";

  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  labelEl.style.color = COLOR.navy;
  labelEl.style.fontWeight = "700";
  labelEl.style.width = "140px";
  labelEl.style.whiteSpace = "nowrap";

  const track = document.createElement("div");
  track.style.width = "90px";
  track.style.height = "12px";
  track.style.background = "#e4ddd0";
  track.style.borderRadius = "6px";
  track.style.overflow = "hidden";
  track.style.flexShrink = "0";

  const fill = document.createElement("div");
  fill.style.height = "100%";
  fill.style.width = "50%";
  fill.style.background = barColor;
  fill.style.borderRadius = "6px";
  fill.style.transition = "width 0.45s ease";
  track.appendChild(fill);

  const value = document.createElement("span");
  value.textContent = "50";
  value.style.color = textColor;
  value.style.fontWeight = "800";
  value.style.minWidth = "26px";
  value.style.textAlign = "right";
  value.style.transition = "transform 0.18s ease";

  row.appendChild(labelEl);
  row.appendChild(track);
  row.appendChild(value);
  return { row, value, fill };
}

// The "Your Money" row (hidden until a stage sets an amount).
function buildMoneyRow(): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "none";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "10px";
  row.style.margin = "2px 0 10px";
  row.style.padding = "7px 11px";
  row.style.background = "#fbf3dd";
  row.style.border = "1px solid #e8d6a8";
  row.style.borderRadius = "10px";

  const label = document.createElement("span");
  label.textContent = "Your Money";
  label.style.color = COLOR.navy;
  label.style.fontWeight = "800";
  label.style.fontSize = "13px";

  moneyValueEl = document.createElement("span");
  moneyValueEl.textContent = "$0";
  moneyValueEl.style.color = COLOR.textGold;
  moneyValueEl.style.fontWeight = "800";
  moneyValueEl.style.fontSize = "20px";
  moneyValueEl.style.transition = "transform 0.16s ease, color 0.2s ease";

  row.appendChild(label);
  row.appendChild(moneyValueEl);
  moneyRowEl = row;
  return row;
}

function showMoneyRow() {
  if (moneyRowEl) moneyRowEl.style.display = "flex";
}
export function hideMoneyRow() {
  if (moneyRowEl) moneyRowEl.style.display = "none";
}

// A quick pop on a number that just changed.
function bumpValue(el: HTMLElement | null) {
  if (!el) return;
  el.style.transform = "scale(1.25)";
  setTimeout(function () {
    if (el) el.style.transform = "scale(1)";
  }, 180);
}

// Push the current meter numbers and bar widths into the HUD.
function refreshMeters() {
  const s = getScores();
  if (hudGrowthValue) hudGrowthValue.textContent = String(Math.round(s.growth));
  if (hudSecurityValue) hudSecurityValue.textContent = String(Math.round(s.security));
  if (hudSmartsValue) hudSmartsValue.textContent = String(Math.round(s.smarts));
  if (hudGrowthFill) hudGrowthFill.style.width = s.growth + "%";
  if (hudSecurityFill) hudSecurityFill.style.width = s.security + "%";
  if (hudSmartsFill) hudSmartsFill.style.width = s.smarts + "%";
}

// Set the money instantly, with a pop (used when a stage begins).
function setMoneyDisplay(value: number) {
  hudDisplayedMoney = value;
  showMoneyRow();
  if (moneyValueEl) {
    moneyValueEl.style.color = COLOR.textGold;
    moneyValueEl.textContent = "$" + value;
    moneyValueEl.style.transform = "scale(1.18)";
    setTimeout(function () {
      if (moneyValueEl) moneyValueEl.style.transform = "scale(1)";
    }, 170);
  }
}

// Count the money up or down, flashing green for a gain, red for a loss.
function animateMoneyTo(target: number, isGain: boolean) {
  if (!moneyValueEl) {
    hudDisplayedMoney = target;
    return;
  }
  const start = hudDisplayedMoney;
  const steps = 14;
  let i = 0;
  moneyValueEl.style.color = isGain ? COLOR.textGreen : COLOR.moneyDown;
  moneyValueEl.style.transform = "scale(1.28)";
  const timer = setInterval(function () {
    i = i + 1;
    const t = i / steps;
    const val = Math.round(start + (target - start) * t);
    if (moneyValueEl) moneyValueEl.textContent = "$" + val;
    if (i >= steps) {
      clearInterval(timer);
      if (moneyValueEl) {
        moneyValueEl.textContent = "$" + target;
        moneyValueEl.style.transform = "scale(1)";
      }
      setTimeout(function () {
        if (moneyValueEl) moneyValueEl.style.color = COLOR.textGold;
      }, 280);
    }
  }, 26);
  hudDisplayedMoney = target;
}

// Paint the current goal line into the DOM HUD.
function paintObjective(text: string) {
  if (hudObjective) {
    hudObjective.textContent = text ? "Goal: " + text : "";
    hudObjective.style.display = text ? "block" : "none";
  }
}

// Update the little stage label in the HUD header for each phase.
export function setHudStage(phase: Phase) {
  if (!hudStageChip) return;
  let label = "Getting Ready";
  if (phase === "stage1") label = "Stage 1";
  else if (phase === "stage2") label = "Stage 2";
  else if (phase === "stage3") label = "Stage 3";
  else if (phase === "report") label = "Report";
  hudStageChip.textContent = label;
}

// Build the HUD and start listening for state changes.
export function initHud() {
  const hud = document.createElement("div");
  hud.style.position = "fixed";
  hud.style.top = "16px";
  hud.style.left = "16px";
  hud.style.zIndex = "1000";
  hud.style.background = "rgba(255, 252, 244, 0.95)";
  hud.style.padding = "12px 16px 10px";
  hud.style.borderRadius = "14px";
  hud.style.border = "2px solid " + COLOR.navy;
  hud.style.fontFamily = "system-ui, sans-serif";
  hud.style.fontSize = "14px";
  hud.style.boxShadow = "0 4px 14px rgba(31, 58, 95, 0.3)";
  hud.style.pointerEvents = "none";
  hudRoot = hud;

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";
  header.style.marginBottom = "8px";

  const title = document.createElement("span");
  title.textContent = "Money Moves";
  title.style.color = COLOR.navy;
  title.style.fontWeight = "800";
  title.style.fontSize = "15px";

  hudStageChip = document.createElement("span");
  hudStageChip.textContent = "Getting Ready";
  hudStageChip.style.background = COLOR.textGreen;
  hudStageChip.style.color = "#ffffff";
  hudStageChip.style.fontWeight = "700";
  hudStageChip.style.fontSize = "12px";
  hudStageChip.style.padding = "2px 10px";
  hudStageChip.style.borderRadius = "10px";

  header.appendChild(title);
  header.appendChild(hudStageChip);
  hud.appendChild(header);

  hudCharacter = document.createElement("div");
  hudCharacter.style.display = "none";
  hudCharacter.style.fontWeight = "800";
  hudCharacter.style.fontSize = "12px";
  hudCharacter.style.marginBottom = "6px";
  hud.appendChild(hudCharacter);

  hud.appendChild(buildMoneyRow());

  const growthRow = makeHudMeter("Financial Growth", COLOR.growth, COLOR.textGreen);
  const securityRow = makeHudMeter("Financial Security", COLOR.security, COLOR.textBlue);
  const smartsRow = makeHudMeter("Money Smarts", COLOR.smarts, COLOR.textGold);

  hudGrowthValue = growthRow.value;
  hudSecurityValue = securityRow.value;
  hudSmartsValue = smartsRow.value;
  hudGrowthFill = growthRow.fill;
  hudSecurityFill = securityRow.fill;
  hudSmartsFill = smartsRow.fill;

  hud.appendChild(growthRow.row);
  hud.appendChild(securityRow.row);
  hud.appendChild(smartsRow.row);

  hudObjective = document.createElement("div");
  hudObjective.textContent = "";
  hudObjective.style.marginTop = "8px";
  hudObjective.style.background = COLOR.textGold;
  hudObjective.style.color = "#ffffff";
  hudObjective.style.fontWeight = "800";
  hudObjective.style.fontSize = "13px";
  hudObjective.style.padding = "6px 10px";
  hudObjective.style.borderRadius = "10px";
  hudObjective.style.maxWidth = "260px";
  hudObjective.style.display = "none";
  hud.appendChild(hudObjective);

  document.body.appendChild(hud);
  refreshMeters();
  setMoneyDisplay(getMoney());
  hideMoneyRow(); // stays hidden until a stage sets an amount

  // React to every state change.
  onScore(function (meter: Meter) {
    refreshMeters();
    if (meter === "growth") bumpValue(hudGrowthValue);
    else if (meter === "security") bumpValue(hudSecurityValue);
    else bumpValue(hudSmartsValue);
  });
  onMoney(function (value: number, delta: number | null) {
    if (delta === null) {
      setMoneyDisplay(value); // fresh amount at a stage start
    } else if (delta === 0) {
      hudDisplayedMoney = value;
      bumpValue(moneyValueEl);
    } else {
      animateMoneyTo(value, delta > 0);
    }
  });
  onObjective(paintObjective);
}

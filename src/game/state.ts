// ============================================================================
// state.ts  —  the single source of truth for the game's numbers.
// The three meters, the running money, the current phase, and the choices that
// decide the money personality all live here. Nothing in this module touches
// the DOM or Three.js: it just holds the numbers and tells listeners when they
// change, so the HUD, the 3D scoreboard, and the growing plant can each react
// without this file needing to know they exist.
// ============================================================================

import type { Character, Meter, Phase, StageRecord } from "./types";

// ----------------------------------------------------------------------------
// ECONOMIC CONSTANTS  (the stages read these; single source of the dollar math)
// ----------------------------------------------------------------------------
export const ECON = {
  STARTING_MONEY: 20, // birthday money in the piggy bank
  ALLOWANCE_PER_WEEK: 10, // money earned each week in Stage 1
  SAVINGS_INTEREST_RATE: 0.1, // savings grows this much each week
  FRIEND_OFFER_PRICE: 15, // the rare item the friend offers in Stage 1
  PAYCHECK_STAGE2: 100, // the Stage 2 part-time-job paycheck
  INVEST_GOOD_MULTIPLIER: 1.4, // an investment that does well
  INVEST_BAD_MULTIPLIER: 0.7, // an investment that struggles
  INVEST_GOOD_PROBABILITY: 0.55, // chance an investment does well
  SURPRISE_EXPENSE: 30, // the unexpected cost in Stage 3
  // (Stage 3's "money to spread" is now the carried balance, so the old fixed
  // BIG_DECISION_FUNDS is gone — the amount comes from the student's real total.)
};

// Money Smarts awarded for Gus's quiz answers (shared by all three questions).
export const SMARTS_BEST = 10; // the best answer
export const SMARTS_OK = 0; // a wrong answer earns none, so the meter reflects
//                             actually getting the answers right

// ----------------------------------------------------------------------------
// HOUSE PALETTE  (the Market Harvest colonial parchment look). Bright values
// draw the bars; TEXT_ values are darker, high-contrast words on light cards.
// ----------------------------------------------------------------------------
export const COLOR = {
  navy: "#1F3A5F",
  textGold: "#8a6118",
  textGreen: "#2e7d32",
  textBlue: "#1e5fa8",
  growth: "#5fae4a", // Financial Growth bar (green)
  security: "#4a8fd6", // Financial Security bar (blue)
  smarts: "#c8962a", // Money Smarts bar (gold)
  moneyDown: "#a33b2a", // rust red for a loss
};

// ----------------------------------------------------------------------------
// THE THREE METERS  (each starts at 50, the neutral middle, and moves 0..100)
// ----------------------------------------------------------------------------
const SCORE_MIN = 0;
const SCORE_MAX = 100;
let scoreGrowth = 50;
let scoreSecurity = 50;
let scoreSmarts = 50;

// The running money the student carries. setMoney resets it at a stage start;
// changeMoney nudges it as they spend, save, earn, or invest.
let currentMoney = 0;

// The master flow phase.
let currentPhase: Phase = "setup";

// Which plan the player picked in each stage. The final money personality is
// decided from THESE choices, not just the meter numbers, so the report can
// never tell a spender they were a saver.
export const choices = { stage1: "", stage2: "", stage3: "" };

// The explorer chosen at Setup (only the name is used, for the report greeting).
let chosenCharacter: Character | null = null;
export function setChosenCharacter(c: Character | null) {
  chosenCharacter = c;
}
export function getChosenCharacter(): Character | null {
  return chosenCharacter;
}

// ----------------------------------------------------------------------------
// MONEY TIMELINE  (how the balance moved across each stage, for the report and
// the exportable session summary). Indexed by stage so a re-entered stage
// overwrites rather than duplicates.
// ----------------------------------------------------------------------------
const stageHistory: StageRecord[] = [];
const stageStartTimes: number[] = []; // ms timestamps, for per-stage elapsed time
export function beginStageRecord(stage: number, title: string, startMoney: number) {
  stageHistory[stage - 1] = { stage, title, startMoney, endMoney: startMoney, keyChoice: "", seconds: 0 };
  stageStartTimes[stage - 1] = Date.now();
}
export function finishStageRecord(stage: number, endMoney: number, keyChoice: string) {
  const r = stageHistory[stage - 1];
  if (r) {
    r.endMoney = endMoney;
    r.keyChoice = keyChoice;
    const started = stageStartTimes[stage - 1];
    if (started) r.seconds = Math.round((Date.now() - started) / 1000);
  }
}
export function getStageHistory(): StageRecord[] {
  return stageHistory.filter(Boolean);
}

// ----------------------------------------------------------------------------
// CHANGE NOTIFICATIONS  (the HUD / scoreboard / plant subscribe to these)
// ----------------------------------------------------------------------------
type ScoreListener = (meter: Meter, before: number, after: number) => void;
type MoneyListener = (value: number, delta: number | null) => void; // null = reset
type ObjectiveListener = (text: string) => void;

const scoreListeners: ScoreListener[] = [];
const moneyListeners: MoneyListener[] = [];
const objectiveListeners: ObjectiveListener[] = [];
export function onScore(cb: ScoreListener) {
  scoreListeners.push(cb);
}
export function onMoney(cb: MoneyListener) {
  moneyListeners.push(cb);
}
export function onObjective(cb: ObjectiveListener) {
  objectiveListeners.push(cb);
}

// The current one-line goal ("go say hi to Gus"). Both the DOM HUD and the
// headset scoreboard show it, so it lives here and notifies both.
let currentObjective = "";
export function getObjective(): string {
  return currentObjective;
}
export function setObjective(text: string) {
  currentObjective = text;
  for (const cb of objectiveListeners) cb(text);
  console.log("[OBJECTIVE] " + text);
}

// ----------------------------------------------------------------------------
// READERS
// ----------------------------------------------------------------------------
export function getScores() {
  return { growth: scoreGrowth, security: scoreSecurity, smarts: scoreSmarts };
}
export function getMoney(): number {
  return currentMoney;
}
export function getPhase(): Phase {
  return currentPhase;
}
export function setPhase(p: Phase) {
  currentPhase = p;
}

function clampScore(value: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, value));
}

// The one and only way to change a meter. delta is positive to reward, negative
// to penalize. Listeners (HUD, scoreboard, plant) get the before/after values.
export function updateScore(meter: Meter, delta: number) {
  let before = 0;
  let after = 0;
  if (meter === "growth") {
    before = scoreGrowth;
    after = clampScore(scoreGrowth + delta);
    scoreGrowth = after;
  } else if (meter === "security") {
    before = scoreSecurity;
    after = clampScore(scoreSecurity + delta);
    scoreSecurity = after;
  } else if (meter === "smarts") {
    before = scoreSmarts;
    after = clampScore(scoreSmarts + delta);
    scoreSmarts = after;
  } else {
    console.warn("updateScore: unknown meter " + meter);
    return;
  }
  console.log("[SCORE] " + meter + ": " + before + " to " + after);
  for (const cb of scoreListeners) cb(meter, before, after);
}

// Set the money to a fresh amount (used when each stage begins).
export function setMoney(amount: number) {
  currentMoney = Math.max(0, Math.round(amount));
  for (const cb of moneyListeners) cb(currentMoney, null);
  console.log("[MONEY] set to " + currentMoney);
}

// Count the money up or down by delta (a gain or a loss).
export function changeMoney(delta: number) {
  const target = Math.max(0, Math.round(currentMoney + delta));
  currentMoney = target;
  for (const cb of moneyListeners) cb(target, delta);
  console.log("[MONEY] change " + delta + " to " + target);
}

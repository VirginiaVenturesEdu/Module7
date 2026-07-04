// ============================================================================
// types.ts  —  the shared vocabulary for Money Moves.
// Real interfaces replace the `any` that used to sit on panel documents, plan
// tables, and the personality map, so the type checker can actually catch a
// typo'd element id or a missing plan field before it ships.
// ============================================================================

import type { Entity } from "@iwsdk/core";

// A panel's transform entity (the thing with .object3D, added via PanelUI).
export type PanelEntity = Entity;

// The tiny slice of a compiled UIKit document we actually use. getElementById
// returns an element we can push properties onto (text, display, color, onClick).
export interface PanelElement {
  setProperties(props: Record<string, unknown>): void;
}
export interface PanelDoc {
  getElementById(id: string): PanelElement | null;
}

// The three score meters.
export type Meter = "growth" | "security" | "smarts";

// The master flow phases.
export type Phase = "setup" | "stage1" | "stage2" | "stage3" | "report";

// One of the four explorers the student picks at Setup.
export interface Character {
  id: string;
  name: string;
  trait: string; // a verb phrase Gus references, e.g. "love gadgets"
  accent: string; // the HUD/report accent color for this explorer
}

// Stage 2 invest plans: how the paycheck is split, and how each meter moves.
export interface Stage2Plan {
  key: string;
  invest: number;
  save: number;
  security: number;
  smarts: number;
  growthGood: number;
  growthBad: number;
  takeawayGood?: string;
  takeawayBad?: string;
  takeawaySafe?: string;
}

// Stage 3 spread plans: how the big decision handles the surprise expense.
export interface Stage3Plan {
  key: string;
  security: number;
  growth: number;
  smarts: number;
  moneyHit: number; // dollars the surprise costs; worse when poorly spread
  surprise: string;
  takeaway: string;
}

// The final money personality shown on the report.
export interface Personality {
  name: string;
  blurb: string;
}

// One row of the money timeline: how the running balance moved across a stage,
// and the key decision the student made. Fed into the report (and the export).
export interface StageRecord {
  stage: number; // 1, 2, or 3
  title: string; // "Growing Up", "First Paycheck", "The Big Decision"
  startMoney: number;
  endMoney: number;
  keyChoice: string; // e.g. "Invested $40, it grew to $56"
  seconds: number; // wall-clock time the student spent in the stage
}

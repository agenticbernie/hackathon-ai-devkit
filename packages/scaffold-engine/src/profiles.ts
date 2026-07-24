/**
 * Scaffold profile registry and definitions.
 *
 * Each profile is a data-driven generator: given project context it
 * produces a complete list of files with real content.
 */

import type { DemoFlowStep, FeatureMapping, ScaffoldFile } from '@hadk/core';
import { hashContent } from './index.js';
import { webAiFullstackProfile } from './profile-fullstack.js';
import { webAiSplitProfile } from './profile-split.js';
import { blockchainProfile } from './profile-blockchain.js';

// ─── Profile Interface ───────────────────────────────────────────────────────

export interface ProfileContext {
  projectName: string;
  features: string[];
  featureMapping: Record<string, FeatureMapping>;
  demoFlow: DemoFlowStep[];
  wowMoment: string | null;
  teamSize: number;
  ideaName: string;
}

export interface ProfileDefinition {
  name: string;
  description: string;
  stack: string[];
  startupCommand: string;
  healthCheck: string;
  postInstallCommands: string[];
  generateFiles(ctx: ProfileContext): ScaffoldFile[];
  mapFeature(featureId: string, featureName: string): FeatureMapping;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const PROFILES: Record<string, ProfileDefinition> = {
  'web-ai-fullstack': webAiFullstackProfile,
  'web-ai-split': webAiSplitProfile,
  blockchain: blockchainProfile,
};

export function getProfile(name: string): ProfileDefinition | undefined {
  return PROFILES[name];
}

export function listProfiles(): string[] {
  return Object.keys(PROFILES);
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

export function mkFile(path: string, content: string, overwrite = false): ScaffoldFile {
  return { path, template: content, content_hash: hashContent(content), overwrite };
}

export function featureComponentName(featureId: string): string {
  return featureId
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

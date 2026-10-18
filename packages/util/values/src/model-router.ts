/**
 * Model routing decision model.
 *
 * Produces a routing decision from task requirements, available providers, and
 * user constraints. The router never assumes the most expensive or newest model
 * is best; it scores candidates by required capabilities, availability, privacy,
 * and context fit. This module performs no I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/model-router
 */

/** A provider/model candidate for routing. */
export interface RoutingCandidate {
  /** Provider identifier. */
  readonly providerId: string;
  /** Model identifier. */
  readonly modelId: string;
  /** Capabilities the candidate supports. */
  readonly capabilities: readonly string[];
  /** Whether the provider is currently available. */
  readonly available: boolean;
  /** Whether the provider is allowed for the data sensitivity. */
  readonly privacyAllowed: boolean;
  /** Maximum context tokens supported. */
  readonly maxContextTokens: number;
  /** Whether this is the user's explicit selection. */
  readonly userSelected?: boolean;
}

/** Requirements a task imposes on a model. */
export interface RoutingRequirements {
  /** Capabilities the task requires. */
  readonly requiredCapabilities: readonly string[];
  /** Minimum context tokens needed. */
  readonly minContextTokens: number;
  /** Whether image input is required. */
  readonly requiresImage?: boolean;
  /** Data sensitivity level. */
  readonly dataSensitivity: 'public' | 'internal' | 'confidential';
  /** Whether the user explicitly selected a provider/model. */
  readonly userSelection?: { readonly providerId: string; readonly modelId: string };
}

/** A routing decision. */
export interface RoutingDecision {
  /** Selected provider, or null when none available. */
  readonly providerId: string | null;
  /** Selected model, or null when none available. */
  readonly modelId: string | null;
  /** Human-readable explanation of the selection. */
  readonly explanation: string;
  /** Whether the selection came from an explicit user override. */
  readonly fromUserOverride: boolean;
  /** Candidates that were rejected, with reasons. */
  readonly rejected: readonly { readonly providerId: string; readonly modelId: string; readonly reason: string }[];
  /** Fallback used when the preferred candidate was unavailable. */
  readonly usedFallback: boolean;
}

/**
 * Decide which model to route a task to.
 * @param requirements - task requirements.
 * @param candidates - available candidates.
 * @returns the routing decision.
 */
export function routeModel(requirements: RoutingRequirements, candidates: readonly RoutingCandidate[]): RoutingDecision {
  const rejected: { providerId: string; modelId: string; reason: string }[] = [];

  // Explicit user selection takes precedence when available and capable.
  if (requirements.userSelection !== undefined) {
    const selected = candidates.find(
      (c) => c.providerId === requirements.userSelection!.providerId && c.modelId === requirements.userSelection!.modelId,
    );
    if (selected !== undefined) {
      const missing = requirements.requiredCapabilities.filter((cap) => !selected.capabilities.includes(cap));
      if (missing.length > 0) {
        rejected.push({ providerId: selected.providerId, modelId: selected.modelId, reason: `missing capabilities: ${missing.join(', ')}` });
      } else if (!selected.available) {
        rejected.push({ providerId: selected.providerId, modelId: selected.modelId, reason: 'provider unavailable' });
      } else if (!selected.privacyAllowed && requirements.dataSensitivity !== 'public') {
        rejected.push({ providerId: selected.providerId, modelId: selected.modelId, reason: 'privacy policy disallows this provider' });
      } else if (selected.maxContextTokens < requirements.minContextTokens) {
        rejected.push({ providerId: selected.providerId, modelId: selected.modelId, reason: 'insufficient context capacity' });
      } else {
        return {
          providerId: selected.providerId,
          modelId: selected.modelId,
          explanation: 'Selected because the user explicitly chose this provider and model.',
          fromUserOverride: true,
          rejected,
          usedFallback: false,
        };
      }
    } else {
      rejected.push({
        providerId: requirements.userSelection.providerId,
        modelId: requirements.userSelection.modelId,
        reason: 'selected provider/model not configured',
      });
    }
  }

  // Score remaining candidates.
  const eligible: RoutingCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.userSelected === true && requirements.userSelection !== undefined) continue;
    const missing = requirements.requiredCapabilities.filter((cap) => !candidate.capabilities.includes(cap));
    if (missing.length > 0) {
      rejected.push({ providerId: candidate.providerId, modelId: candidate.modelId, reason: `missing capabilities: ${missing.join(', ')}` });
      continue;
    }
    if (requirements.requiresImage === true && !candidate.capabilities.includes('image-input')) {
      rejected.push({ providerId: candidate.providerId, modelId: candidate.modelId, reason: 'image input required but not supported' });
      continue;
    }
    if (!candidate.available) {
      rejected.push({ providerId: candidate.providerId, modelId: candidate.modelId, reason: 'provider unavailable' });
      continue;
    }
    if (!candidate.privacyAllowed && requirements.dataSensitivity !== 'public') {
      rejected.push({ providerId: candidate.providerId, modelId: candidate.modelId, reason: 'privacy policy disallows this provider' });
      continue;
    }
    if (candidate.maxContextTokens < requirements.minContextTokens) {
      rejected.push({ providerId: candidate.providerId, modelId: candidate.modelId, reason: 'insufficient context capacity' });
      continue;
    }
    eligible.push(candidate);
  }

  if (eligible.length === 0) {
    return {
      providerId: null,
      modelId: null,
      explanation: 'No configured provider can satisfy the required capabilities, availability, privacy, and context constraints.',
      fromUserOverride: false,
      rejected,
      usedFallback: false,
    };
  }

  // Prefer higher context capacity, then availability order; never prefer cost or novelty.
  const chosen = eligible.slice().sort((a, b) => b.maxContextTokens - a.maxContextTokens)[0]!;

  const usedFallback = requirements.userSelection !== undefined;
  return {
    providerId: chosen.providerId,
    modelId: chosen.modelId,
    explanation: usedFallback
      ? `Selected ${chosen.providerId}/${chosen.modelId} as a fallback because the user-selected provider could not be used.`
      : `Selected ${chosen.providerId}/${chosen.modelId} because it supports the required capabilities, is available, permits the data sensitivity level, and has sufficient context capacity.`,
    fromUserOverride: false,
    rejected,
    usedFallback,
  };
}

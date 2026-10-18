/**
 * Pure model-capability declarations and queries.
 *
 * A provider exposes only the capabilities it actually supports. This module
 * records that set and answers containment questions without assuming that all
 * providers implement everything.
 *
 * @module @deepseek-ai/dsh-util-values/model-capabilities
 */

/** A model capability a provider may expose. */
export type ModelCapability =
  | 'text'
  | 'streaming'
  | 'tool-calling'
  | 'structured-output'
  | 'vision'
  | 'cancellation'

/** The capability set a provider declares. */
export interface ModelCapabilities {
  readonly supported: readonly ModelCapability[]
}

/**
 * Whether a capability is declared.
 * @param capabilities - declared capabilities.
 * @param capability - capability to test.
 * @returns `true` when supported.
 */
export function supports(capabilities: ModelCapabilities, capability: ModelCapability): boolean {
  return capabilities.supported.includes(capability)
}

/**
 * Whether every required capability is declared.
 * @param capabilities - declared capabilities.
 * @param required - required capabilities.
 * @returns `true` when all are supported.
 */
export function supportsAll(
  capabilities: ModelCapabilities,
  required: readonly ModelCapability[],
): boolean {
  return required.every((capability) => supports(capabilities, capability))
}

/**
 * Whether at least one required capability is declared.
 * @param capabilities - declared capabilities.
 * @param required - candidate capabilities.
 * @returns `true` when any is supported.
 */
export function supportsAny(
  capabilities: ModelCapabilities,
  required: readonly ModelCapability[],
): boolean {
  return required.some((capability) => supports(capabilities, capability))
}

/**
 * Number of declared capabilities.
 * @param capabilities - declared capabilities.
 * @returns the count.
 */
export function capabilityCount(capabilities: ModelCapabilities): number {
  return capabilities.supported.length
}

/**
 * Required capabilities that are not declared.
 * @param capabilities - declared capabilities.
 * @param required - required capabilities.
 * @returns the missing capabilities, in the order given.
 */
export function missingCapabilities(
  capabilities: ModelCapabilities,
  required: readonly ModelCapability[],
): readonly ModelCapability[] {
  return required.filter((capability) => !supports(capabilities, capability))
}

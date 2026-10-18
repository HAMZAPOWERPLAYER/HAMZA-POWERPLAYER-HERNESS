/**
 * Asset and resource pipeline model.
 *
 * Provides asset inventory tracking, reference validation, and resource
 * optimization primitives for game projects. All helpers are pure: they analyze
 * caller-supplied asset lists, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/asset-pipeline
 */

/** One asset in the project. */
export interface GameAsset {
  /** Asset path. */
  readonly path: string;
  /** Asset type. */
  readonly type: 'texture' | 'model' | 'animation' | 'audio' | 'font' | 'scene' | 'prefab' | 'script' | 'other';
  /** File size in bytes. */
  readonly sizeBytes: number;
  /** Import hash, if any. */
  readonly importHash: string | null;
  /** Whether the asset is referenced by other assets. */
  readonly referenced: boolean;
  /** Referencing asset paths. */
  readonly referencedBy: readonly string[];
}

/** Asset inventory result. */
export interface AssetInventory {
  /** All assets. */
  readonly assets: readonly GameAsset[];
  /** Total asset count. */
  readonly totalCount: number;
  /** Total size in bytes. */
  readonly totalSizeBytes: number;
  /** Assets by type. */
  readonly byType: readonly { readonly type: string; readonly count: number; readonly sizeBytes: number }[];
  /** Unreferenced assets. */
  readonly unreferenced: readonly string[];
  /** Missing referenced assets. */
  readonly missingReferences: readonly string[];
}

/**
 * Build an asset inventory from observed files.
 *
 * @param files - observed project files with their paths, sizes, and optional content.
 * @returns an inventory of assets, per-type totals, unreferenced assets, and missing references.
 */
export function buildAssetInventory(
  files: readonly { readonly path: string; readonly sizeBytes: number; readonly content: string | null }[],
): AssetInventory {
  const assets: GameAsset[] = [];
  const unresolvedRefs: string[] = [];

  for (const file of files) {
    const type = inferAssetType(file.path);
    const referencedBy: string[] = [];

    // Scan content for references to other assets
    if (file.content !== null) {
      const refs = extractAssetReferences(file.content);
      for (const ref of refs) {
        const resolved = resolveAssetRef(ref, files);
        if (resolved !== null) {
          referencedBy.push(resolved);
        } else {
          unresolvedRefs.push(ref);
        }
      }
    }

    assets.push({
      path: file.path,
      type,
      sizeBytes: file.sizeBytes,
      importHash: null,
      referenced: false, // will be filled in second pass
      referencedBy,
    });
  }

  // Second pass: mark assets that are referenced by others; an asset's own
  // reference does not count as another asset using it.
  const referencedPaths = new Set<string>();
  for (const asset of assets) {
    for (const ref of asset.referencedBy) {
      if (ref !== asset.path) {
        referencedPaths.add(ref);
      }
    }
  }
  const assetsWithRefs = assets.map((a) => ({
    ...a,
    referenced: referencedPaths.has(a.path),
  }));

  // Find missing references
  const allPaths = new Set(assetsWithRefs.map((a) => a.path));
  const missingReferences: string[] = [...unresolvedRefs];
  for (const asset of assetsWithRefs) {
    for (const ref of asset.referencedBy) {
      if (!allPaths.has(ref)) {
        missingReferences.push(ref);
      }
    }
  }

  const byTypeMap = new Map<string, { count: number; sizeBytes: number }>();
  for (const asset of assetsWithRefs) {
    const existing = byTypeMap.get(asset.type) || { count: 0, sizeBytes: 0 };
    byTypeMap.set(asset.type, {
      count: existing.count + 1,
      sizeBytes: existing.sizeBytes + asset.sizeBytes,
    });
  }

  const byType = Array.from(byTypeMap.entries()).map(([type, data]) => ({
    type,
    count: data.count,
    sizeBytes: data.sizeBytes,
  }));

  return {
    assets: assetsWithRefs,
    totalCount: assetsWithRefs.length,
    totalSizeBytes: assetsWithRefs.reduce((sum, a) => sum + a.sizeBytes, 0),
    byType,
    unreferenced: assetsWithRefs.filter((a) => !a.referenced).map((a) => a.path),
    missingReferences: [...new Set(missingReferences)].sort(),
  };
}

/** Infer asset type from file path. */
function inferAssetType(path: string): GameAsset['type'] {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.tga') || lower.endsWith('.bmp')) return 'texture';
  if (lower.endsWith('.fbx') || lower.endsWith('.obj') || lower.endsWith('.blend') || lower.endsWith('.dae')) return 'model';
  if (lower.endsWith('.anim') || (lower.endsWith('.fbx') && lower.includes('anim'))) return 'animation';
  if (lower.endsWith('.wav') || lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.aac')) return 'audio';
  if (lower.endsWith('.ttf') || lower.endsWith('.otf')) return 'font';
  if (lower.endsWith('.unity') || lower.endsWith('.tscn')) return 'scene';
  if (lower.endsWith('.prefab')) return 'prefab';
  if (lower.endsWith('.cs') || lower.endsWith('.js') || lower.endsWith('.gd')) return 'script';
  return 'other';
}

/** Extract asset references from content text. */
function extractAssetReferences(content: string): readonly string[] {
  const refs: string[] = [];
  const patterns = [
    /["']([^"']*\.(?:png|jpg|jpeg|tga|bmp|fbx|obj|blend|dae|wav|mp3|ogg|aac|ttf|otf|unity|tscn|prefab|cs|js|gd))["']/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const ref = match[1];
      if (ref !== undefined && !refs.includes(ref)) {
        refs.push(ref);
      }
    }
  }
  return refs;
}

/** Resolve an asset reference to an observed file path. */
function resolveAssetRef(
  ref: string,
  files: readonly { readonly path: string; readonly sizeBytes: number; readonly content: string | null }[],
): string | null {
  // Direct match
  for (const f of files) {
    if (f.path === ref) return ref;
  }
  // Try with extensions
  for (const f of files) {
    if (f.path.endsWith(ref) || f.path.endsWith(ref + '.meta')) return f.path;
  }
  return null;
}

/**
 * Validate asset inventory for issues.
 *
 * @param inventory - asset inventory to check.
 * @returns descriptions of the problems found; empty when none were found.
 */
export function validateAssetInventory(inventory: AssetInventory): readonly string[] {
  const problems: string[] = [];

  if (inventory.unreferenced.length > 0) {
    problems.push(`${inventory.unreferenced.length} unreferenced asset(s) found`);
  }

  if (inventory.missingReferences.length > 0) {
    problems.push(`${inventory.missingReferences.length} missing reference(s): ${inventory.missingReferences.slice(0, 5).join(', ')}`);
  }

  const largeAssets = inventory.assets.filter((a) => a.sizeBytes > 50 * 1024 * 1024); // 50MB
  if (largeAssets.length > 0) {
    problems.push(`${largeAssets.length} asset(s) exceed 50MB`);
  }

  return problems;
}

/**
 * Check if an asset path is likely a texture.
 *
 * @param path - asset file path to classify.
 * @returns whether the inferred asset type is a texture.
 */
export function isTextureAsset(path: string): boolean {
  return inferAssetType(path) === 'texture';
}

/**
 * Check if an asset path is likely an audio asset.
 *
 * @param path - asset file path to classify.
 * @returns whether the inferred asset type is audio.
 */
export function isAudioAsset(path: string): boolean {
  return inferAssetType(path) === 'audio';
}

/**
 * Check if an asset path is likely a model asset.
 *
 * @param path - asset file path to classify.
 * @returns whether the inferred asset type is a model.
 */
export function isModelAsset(path: string): boolean {
  return inferAssetType(path) === 'model';
}

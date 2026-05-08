/**
 * Sandbox-side re-export of shared color primitives. Keeps existing
 * `import "../primitives/color"` paths inside checks/ working while the
 * canonical implementation lives in shared/ for CLI re-use.
 */

export {
  relativeLuminance,
  contrastRatio,
  blendOver,
  effectiveAlpha,
  clamp01,
  rgbToHex,
  hexToRgb,
} from "@shared/color/srgb";

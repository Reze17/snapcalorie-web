import { MAX_EDGE_PX } from "./constants";

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * The resize helper: computes the largest dimensions that fit within
 * maxEdge on the longest side while preserving aspect ratio. Works
 * identically for landscape and portrait (it only ever looks at whichever
 * side is longest), and is a no-op when the image is already small enough.
 */
export function computeDownsampleDimensions(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): Dimensions {
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions: ${width}x${height}`);
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

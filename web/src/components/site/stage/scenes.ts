/**
 * The contract between page sections and the fixed particle stage.
 *
 * A section wrapper carries data-stage="<scene>". While the viewport's middle is inside
 * that wrapper, the stage plays that scene, with progress 0 → 1 from the wrapper's top
 * reaching the middle to its bottom leaving it. Outside every marked wrapper the stage
 * fades out.
 *
 * hero     globe low in the frame, rising, light pillars on
 * stats    globe centred, a little larger, turning
 * burst    globe opens into a loose shell, then settles into a low cloud
 * gateway  the cloud gathers into the centre shape (our placeholder for their bust)
 * steps    globe again, left of centre, turned to Asia, with its reflection
 */
export const SCENES = ["hero", "stats", "burst", "gateway", "steps"] as const;
export type Scene = (typeof SCENES)[number];

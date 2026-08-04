/**
 * Centralized AI model constants for BuildPro.
 * Update these to change the model used across all features.
 */

/** Primary model — used for general chat/text tasks. */
export const BUILDPRO_AI_MODEL = "gpt-5";

/** Vision model — used for image/receipt scanning tasks. gpt-5.6-terra reliably returns content for image_url inputs. */
export const BUILDPRO_VISION_MODEL = "gpt-5.6-terra";

/** Mini model — used for faster/cheaper tasks (e.g. bid summarization, prospect import, website AI). */
export const BUILDPRO_AI_MINI_MODEL = "gpt-5-mini";

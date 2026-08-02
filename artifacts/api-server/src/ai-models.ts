/**
 * Centralized AI model constants for BuildPro.
 * Update these to change the model used across all features.
 */

/** Primary model — used for vision/chat tasks that need full capability (e.g. receipt scanning). */
export const BUILDPRO_AI_MODEL = "gpt-5";

/** Mini model — used for faster/cheaper tasks (e.g. bid summarization, prospect import, website AI). */
export const BUILDPRO_AI_MINI_MODEL = "gpt-5-mini";

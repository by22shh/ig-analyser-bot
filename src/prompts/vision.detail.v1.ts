export const visionDetailPrompt = {
  key: "vision.detail.v2",
  version: "2026-06-05",
  system:
    "Describe only visible, public visual facts in Instagram post images. If the image is unavailable and only caption text is provided, say what comes from caption context and mark uncertainty. Avoid identity claims, protected traits, medical, political, religious, sexual, financial, or private-life inferences. Do not guess relationships, personality, wealth, location precision, or intent from appearance. Prefer concrete observable details: scene, objects, text overlays, composition, production value, repeated brand/lifestyle signals. Keep output concise and tied to the given post ID."
};

export const visionDetailPrompt = {
  key: "vision.detail.v3",
  version: "2026-06-05",
  system:
    "Describe only visible, public visual facts in an Instagram post image. Transcribe ALL readable text VERBATIM (brand names, collection labels, signs, stickers, in-frame captions) into textVerbatim — do not summarise or truncate it. Set isLikelyScreenshot=true when the frame shows screenshot/repost framing (black letterbox bars, app UI chrome, status bar) rather than an original photo. Name recurring brand/logo/product cues and the scene/setting type. If the image is unavailable and only caption text is provided, say what comes from caption context and mark uncertainty. Avoid identity claims, protected traits, medical, political, religious, sexual, financial, or private-life inferences. Do not guess relationships, personality, wealth, location precision, or intent from appearance, and do not profile other people who appear in the frame. Prefer concrete observable details: scene, objects, text overlays, composition, production value, repeated brand/lifestyle signals. Keep output concise and tied to the given post ID."
};

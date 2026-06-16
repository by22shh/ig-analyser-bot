import type { AnalysisMode } from "../../telegram/constants.js";
import type { InstagramPost, InstagramProfile } from "../instagram/types.js";
import type { ReportMetrics, VisionAnalysisItemView } from "../reports/types.js";

export type SelectedPostReason =
  | "pinned"
  | "recent"
  | "high_likes"
  | "high_comments"
  | "format_diversity"
  | "profile_signal"
  | "audience_signal"
  | "visual_signal";

export type PostSelectionItem = {
  postId: string;
  url?: string;
  timestamp?: string;
  score: number;
  reasons: SelectedPostReason[];
};

export type PostSelectionResult = {
  posts: InstagramPost[];
  selected: PostSelectionItem[];
  omittedCount: number;
};

export type AnalysisEvidenceItem = {
  id: string;
  type: "profile" | "post" | "audience" | "content_cluster" | "risk" | "opportunity" | "mode";
  label: string;
  detail: string;
  confidence: "low" | "medium" | "high";
  postIds?: string[];
  urls?: string[];
};

export type AnalysisContext = {
  selectedPostIds: string[];
  postSelection: PostSelectionItem[];
  profileSignals: {
    publicContacts: string[];
    publicLinks: string[];
    platformHandles: string[];
    professionHints: string[];
    locationHints: string[];
    bioKeywords: string[];
  };
  contentClusters: Array<{
    label: string;
    count: number;
    postIds: string[];
    keywords: string[];
  }>;
  audienceSignals: {
    frequentCommenters: Array<{ username: string; count: number }>;
    repeatedCommentTerms: Array<{ term: string; count: number }>;
    authorReplies: Array<{ postId: string; url?: string; text: string; timestamp?: string }>;
    authorReplyCount: number;
    authorReplyPostIds: string[];
    questionCommentPostIds: string[];
    commentDensity: "none" | "low" | "medium" | "high";
    highCommentPostIds: string[];
  };
  riskSignals: AnalysisEvidenceItem[];
  opportunitySignals: AnalysisEvidenceItem[];
  modeGuidance: {
    mode: AnalysisMode;
    evidencePriorities: string[];
    scoringFocus: string[];
    cautionRules: string[];
  };
  evidenceMap: AnalysisEvidenceItem[];
};

export type AnalysisContextDigest = Pick<
  AnalysisContext,
  | "selectedPostIds"
  | "postSelection"
  | "profileSignals"
  | "contentClusters"
  | "audienceSignals"
  | "riskSignals"
  | "opportunitySignals"
  | "modeGuidance"
  | "evidenceMap"
>;

const DEFAULT_SELECTION_LIMIT = 30;

const CONTENT_CLUSTERS: Array<{ label: string; keywords: string[]; re: RegExp }> = [
  {
    label: "work_and_expertise",
    keywords: ["founder", "startup", "business", "work", "career", "expert", "эксперт", "бизнес"],
    re: /\b(founder|startup|business|career|work|expert|brand|product)\b|эксперт|бизнес|проект|работ|карьер/iu
  },
  {
    label: "commercial_or_ads",
    keywords: ["ad", "promo", "brand", "sale", "реклама", "скидка", "партнер"],
    re: /\b(ad|ads|promo|sponsored|brand|sale|discount|partner)\b|реклам|скидк|промо|партн[её]р/iu
  },
  {
    label: "education_and_guidance",
    keywords: ["tips", "guide", "howto", "курс", "обучение", "совет"],
    re: /\b(tips|guide|how\s*to|learn|course|checklist)\b|курс|обуч|совет|гайд|чек.?лист/iu
  },
  {
    label: "lifestyle_and_travel",
    keywords: ["travel", "city", "hotel", "trip", "путешествие", "город"],
    re: /\b(travel|trip|hotel|city|beach|restaurant|cafe)\b|путешеств|город|отель|ресторан|кафе/iu
  },
  {
    label: "community_and_events",
    keywords: ["event", "team", "meetup", "community", "команда", "мероприятие"],
    re: /\b(event|meetup|community|team|conference|workshop)\b|команд|мероприят|конференц|встреч/iu
  },
  {
    label: "visual_identity",
    keywords: ["style", "design", "aesthetic", "стиль", "дизайн"],
    re: /\b(style|design|aesthetic|look|visual)\b|стил|дизайн|визуал|эстет/iu
  }
];

const PROFESSION_HINTS = [
  "founder",
  "ceo",
  "marketing",
  "designer",
  "developer",
  "coach",
  "creator",
  "photographer",
  "founder",
  "основатель",
  "маркетолог",
  "дизайнер",
  "разработчик",
  "коуч",
  "эксперт",
  "фотограф",
  "блогер"
];

export function selectAnalysisPosts(
  posts: InstagramPost[],
  options: { limit?: number } = {}
): PostSelectionResult {
  const limit = Math.max(1, options.limit ?? DEFAULT_SELECTION_LIMIT);
  const uniquePosts = uniqueById(posts);
  const maxLikes = Math.max(1, ...uniquePosts.map((post) => post.likesCount));
  const maxComments = Math.max(1, ...uniquePosts.map((post) => post.commentsCount));
  const recentOrder = [...uniquePosts].sort((a, b) => timestampMs(b) - timestampMs(a));
  const recentRank = new Map(recentOrder.map((post, index) => [post.id, index]));
  const firstType = new Set<string>();

  const scored = uniquePosts.map((post) => {
    const reasons = new Set<SelectedPostReason>();
    let score = 0;
    const rank = recentRank.get(post.id) ?? uniquePosts.length;
    if (rank < 8) {
      reasons.add("recent");
      score += Math.max(4, 24 - rank * 2);
    }
    if (post.isPinned) {
      reasons.add("pinned");
      score += 34;
    }
    const likeScore = (post.likesCount / maxLikes) * 24;
    const commentScore = (post.commentsCount / maxComments) * 26;
    if (likeScore >= 12) reasons.add("high_likes");
    if (commentScore >= 12) reasons.add("high_comments");
    score += likeScore + commentScore;

    const typeKey = `${post.type}:${post.productType ?? ""}`.toLowerCase();
    if (typeKey && !firstType.has(typeKey)) {
      firstType.add(typeKey);
      reasons.add("format_diversity");
      score += 10;
    }
    if (hasProfileSignal(post)) {
      reasons.add("profile_signal");
      score += 12;
    }
    if (post.latestComments.length || post.commentsCount > 0) {
      reasons.add("audience_signal");
      score += Math.min(
        10,
        post.latestComments.length * 2 + (post.commentsCount / maxComments) * 8
      );
    }
    if (post.displayUrl || post.childPosts.length || /reel|video|carousel/i.test(post.type)) {
      reasons.add("visual_signal");
      score += 5;
    }
    return {
      post,
      item: {
        postId: post.id,
        url: post.url,
        timestamp: post.timestamp,
        score: Math.round(score),
        reasons: [...reasons]
      }
    };
  });

  const selected = scored
    .sort((a, b) => b.item.score - a.item.score || timestampMs(b.post) - timestampMs(a.post))
    .slice(0, limit);
  return {
    posts: selected.map((entry) => entry.post),
    selected: selected.map((entry) => entry.item),
    omittedCount: Math.max(0, uniquePosts.length - selected.length)
  };
}

export function selectVisionAnalysisPosts(
  posts: InstagramPost[],
  options: { postLimit?: number; imageLimit?: number } = {}
): InstagramPost[] {
  const selection = selectAnalysisPosts(posts, { limit: options.postLimit });
  const imageLimit = Math.max(0, options.imageLimit ?? selection.posts.length);
  return selection.posts.slice(0, imageLimit);
}

export function buildAnalysisContext(input: {
  mode: AnalysisMode;
  profile: InstagramProfile;
  posts: InstagramPost[];
  selection: PostSelectionResult;
  metrics: ReportMetrics;
  vision: VisionAnalysisItemView[];
}): AnalysisContext {
  const profileSignals = buildProfileSignals(input.profile, input.posts);
  const contentClusters = buildContentClusters(input.posts, input.vision);
  const audienceSignals = buildAudienceSignals(input.posts, input.profile.username);
  const riskSignals = buildRiskSignals(
    input.profile,
    input.posts,
    input.metrics,
    contentClusters,
    input.vision
  );
  const opportunitySignals = buildOpportunitySignals(
    input.profile,
    input.posts,
    input.metrics,
    profileSignals
  );
  const modeGuidance = modeGuidanceFor(input.mode);
  const evidenceMap = [
    ...profileEvidence(profileSignals),
    ...selectionEvidence(input.selection),
    ...clusterEvidence(contentClusters),
    ...audienceEvidence(audienceSignals),
    ...riskSignals,
    ...opportunitySignals,
    {
      id: `mode:${input.mode}`,
      type: "mode" as const,
      label: `${input.mode} priorities`,
      detail: modeGuidance.evidencePriorities.join("; "),
      confidence: "high" as const
    }
  ].slice(0, 40);

  return {
    selectedPostIds: input.selection.selected.map((item) => item.postId),
    postSelection: input.selection.selected,
    profileSignals,
    contentClusters,
    audienceSignals,
    riskSignals,
    opportunitySignals,
    modeGuidance,
    evidenceMap
  };
}

export function compactAnalysisContext(
  context: AnalysisContext | undefined
): AnalysisContextDigest | undefined {
  if (!context) return undefined;
  return {
    selectedPostIds: context.selectedPostIds,
    postSelection: context.postSelection.slice(0, 16),
    profileSignals: context.profileSignals,
    contentClusters: context.contentClusters.slice(0, 8),
    audienceSignals: context.audienceSignals,
    riskSignals: context.riskSignals.slice(0, 8),
    opportunitySignals: context.opportunitySignals.slice(0, 8),
    modeGuidance: context.modeGuidance,
    evidenceMap: context.evidenceMap.slice(0, 24)
  };
}

export function analysisContextDigest(context: AnalysisContext): AnalysisContextDigest {
  return {
    selectedPostIds: context.selectedPostIds,
    postSelection: context.postSelection.slice(0, 16),
    profileSignals: context.profileSignals,
    contentClusters: context.contentClusters.slice(0, 8),
    audienceSignals: context.audienceSignals,
    riskSignals: context.riskSignals.slice(0, 8),
    opportunitySignals: context.opportunitySignals.slice(0, 8),
    modeGuidance: context.modeGuidance,
    evidenceMap: context.evidenceMap.slice(0, 24)
  };
}

export function modeGuidanceFor(mode: AnalysisMode): AnalysisContext["modeGuidance"] {
  if (mode === "influencer") {
    return {
      mode,
      evidencePriorities: [
        "brand-safety signals",
        "audience quality from comments",
        "ad saturation and commercial cadence",
        "authenticity checks and missing verification"
      ],
      scoringFocus: ["brand fit", "audience reliability", "creative value", "conversion risk"],
      cautionRules: [
        "Do not assert fake followers without evidence",
        "Separate visual polish from business impact"
      ]
    };
  }
  if (mode === "hr") {
    return {
      mode,
      evidencePriorities: [
        "public work and communication signals",
        "collaboration or learning patterns",
        "fair interview questions",
        "limits of public evidence"
      ],
      scoringFocus: ["interview hypotheses", "work-style signals", "verification plan"],
      cautionRules: [
        "Never infer protected traits or family/private status",
        "Never phrase output as an automated hiring decision"
      ]
    };
  }
  if (mode === "osint_compliance") {
    return {
      mode,
      evidencePriorities: [
        "published public facts",
        "explicit contacts and links",
        "location signals only at coarse level",
        "lawful verification checklist"
      ],
      scoringFocus: ["source reliability", "inconsistency checks", "lawful next steps"],
      cautionRules: [
        "No pressure tactics, private databases, exact-route reconstruction or third-party targeting",
        "Published contacts only when supplied directly"
      ]
    };
  }
  return {
    mode,
    evidencePriorities: [
      "recurring themes across selected posts",
      "audience and comment evidence",
      "visual/textual patterns",
      "practical but safe communication recommendations"
    ],
    scoringFocus: [
      "specificity",
      "source-backed hypotheses",
      "actionability",
      "confidence calibration"
    ],
    cautionRules: [
      "Avoid personality certainty",
      "No harassment, doxing, pressure or privacy bypass"
    ]
  };
}

function buildProfileSignals(
  profile: InstagramProfile,
  posts: InstagramPost[]
): AnalysisContext["profileSignals"] {
  const text = [
    profile.fullName,
    profile.biography,
    profile.externalUrl,
    ...posts.map((post) => post.caption)
  ]
    .filter(Boolean)
    .join("\n");
  const publicLinks = unique(
    [
      profile.externalUrl,
      ...[...text.matchAll(/https?:\/\/[^\s)]+/gi)].map((match) => match[0])
    ].filter((value): value is string => Boolean(value))
  ).slice(0, 12);
  const publicContacts = unique([
    ...[...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]),
    ...[...text.matchAll(/(?:\+?\d[\d\s().-]{7,}\d)/g)].map((match) =>
      match[0].replace(/\s+/g, " ").trim()
    )
  ]).slice(0, 12);
  const platformHandles = unique(
    [...text.matchAll(/(?:^|[\s/:])@([A-Za-z0-9._]{3,32})/g)].map((match) => `@${match[1]}`)
  ).slice(0, 12);
  const lowerText = text.toLowerCase();
  const professionHints = PROFESSION_HINTS.filter((hint) => lowerText.includes(hint)).slice(0, 10);
  const locationHints = unique(
    posts.map((post) => post.location?.name).filter(Boolean) as string[]
  ).slice(0, 10);
  const bioKeywords = topTerms(`${profile.fullName ?? ""} ${profile.biography ?? ""}`, 10);
  return {
    publicContacts,
    publicLinks,
    platformHandles,
    professionHints,
    locationHints,
    bioKeywords
  };
}

function buildContentClusters(
  posts: InstagramPost[],
  vision: VisionAnalysisItemView[]
): AnalysisContext["contentClusters"] {
  const visionByPost = new Map(
    vision
      .filter((item) => item.status === "completed")
      .map((item) => [item.postId, item.description ?? ""])
  );
  return CONTENT_CLUSTERS.map((cluster) => {
    const matched = posts.filter((post) =>
      cluster.re.test(
        [post.caption, post.hashtags.join(" "), post.mentions.join(" "), visionByPost.get(post.id)]
          .filter(Boolean)
          .join(" ")
      )
    );
    return {
      label: cluster.label,
      count: matched.length,
      postIds: matched.slice(0, 8).map((post) => post.id),
      keywords: cluster.keywords
    };
  })
    .filter((cluster) => cluster.count > 0)
    .sort((a, b) => b.count - a.count);
}

function buildAudienceSignals(
  posts: InstagramPost[],
  ownerUsername: string
): AnalysisContext["audienceSignals"] {
  const commenters = new Map<string, number>();
  const commentTerms: string[] = [];
  const authorReplies: AnalysisContext["audienceSignals"]["authorReplies"] = [];
  const questionCommentPostIds = new Set<string>();
  const owner = normalizeUsername(ownerUsername);
  for (const post of posts) {
    for (const comment of post.latestComments) {
      const commentOwner = normalizeUsername(comment.ownerUsername ?? "");
      const isAuthor = comment.isAuthor || (commentOwner.length > 0 && commentOwner === owner);
      if (isAuthor) {
        if (comment.text.trim()) {
          authorReplies.push({
            postId: post.id,
            url: post.url,
            text: comment.text.trim(),
            timestamp: comment.timestamp
          });
        }
        continue;
      }
      if (comment.ownerUsername && commentOwner !== owner)
        commenters.set(comment.ownerUsername, (commenters.get(comment.ownerUsername) ?? 0) + 1);
      commentTerms.push(...topTerms(comment.text, 8));
      if (
        /[?？]|\b(?:where|what|how|when|why|где|что|как|когда|почему|какой|какая|какие)\b/iu.test(
          comment.text
        )
      ) {
        questionCommentPostIds.add(post.id);
      }
    }
  }
  const totalComments = posts.reduce((sum, post) => sum + post.commentsCount, 0);
  const avgComments = posts.length ? totalComments / posts.length : 0;
  const authorReplyPostIds = unique(authorReplies.map((reply) => reply.postId));
  return {
    frequentCommenters: [...commenters.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([username, count]) => ({ username, count })),
    repeatedCommentTerms: Object.entries(frequency(commentTerms))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([term, count]) => ({ term, count })),
    authorReplies: authorReplies.slice(0, 16),
    authorReplyCount: authorReplies.length,
    authorReplyPostIds: authorReplyPostIds.slice(0, 12),
    questionCommentPostIds: [...questionCommentPostIds].slice(0, 12),
    commentDensity:
      avgComments === 0 ? "none" : avgComments < 3 ? "low" : avgComments < 20 ? "medium" : "high",
    highCommentPostIds: [...posts]
      .sort((a, b) => b.commentsCount - a.commentsCount)
      .slice(0, 5)
      .filter((post) => post.commentsCount > 0)
      .map((post) => post.id)
  };
}

function buildRiskSignals(
  profile: InstagramProfile,
  posts: InstagramPost[],
  metrics: ReportMetrics,
  clusters: AnalysisContext["contentClusters"],
  vision: VisionAnalysisItemView[]
): AnalysisEvidenceItem[] {
  const risks: AnalysisEvidenceItem[] = [];
  const followRatio = profile.followersCount ? profile.followsCount / profile.followersCount : 0;
  if (posts.length < 8) {
    risks.push({
      id: "risk:evidence_depth",
      type: "risk",
      label: "Limited evidence depth",
      detail: `Only ${posts.length} selected posts are available, so conclusions need stronger caveats.`,
      confidence: "high"
    });
  }
  if (metrics.engagementRate > 0 && metrics.avgComments / Math.max(1, metrics.avgLikes) < 0.015) {
    risks.push({
      id: "risk:comment_like_gap",
      type: "risk",
      label: "Low comment-to-like ratio",
      detail:
        "Likes are materially stronger than comment activity; audience depth should be verified.",
      confidence: "medium",
      postIds: metrics.topPostsByLikes.map((post) => post.postId)
    });
  }
  if (followRatio > 1.5) {
    risks.push({
      id: "risk:follow_ratio",
      type: "risk",
      label: "High follow ratio",
      detail: `Follows/followers ratio is ${followRatio.toFixed(2)}; interpret reach and status carefully.`,
      confidence: "medium"
    });
  }
  const commercial = clusters.find((cluster) => cluster.label === "commercial_or_ads");
  if (commercial && commercial.count >= Math.max(3, Math.ceil(posts.length / 3))) {
    risks.push({
      id: "risk:ad_saturation",
      type: "risk",
      label: "Commercial/ad saturation",
      detail: `${commercial.count} selected posts have commercial or ad-like signals.`,
      confidence: "medium",
      postIds: commercial.postIds
    });
  }
  const failedVision = vision.filter(
    (item) => item.status === "failed" || item.status === "skipped" || item.status === "low_quality"
  );
  if (failedVision.length) {
    risks.push({
      id: "risk:vision_gaps",
      type: "risk",
      label: "Vision evidence gaps",
      detail: `${failedVision.length} selected visual items could not be analyzed and should not support visual claims.`,
      confidence: "high",
      postIds: failedVision.slice(0, 8).map((item) => item.postId)
    });
  }
  return risks.slice(0, 10);
}

function buildOpportunitySignals(
  profile: InstagramProfile,
  posts: InstagramPost[],
  metrics: ReportMetrics,
  profileSignals: AnalysisContext["profileSignals"]
): AnalysisEvidenceItem[] {
  const opportunities: AnalysisEvidenceItem[] = [];
  if (profileSignals.publicLinks.length || profileSignals.publicContacts.length) {
    opportunities.push({
      id: "opportunity:published_contact",
      type: "opportunity",
      label: "Published contact/channel",
      detail:
        "The profile exposes explicit public contact or link surfaces; use only respectful/public outreach.",
      confidence: "high",
      urls: profileSignals.publicLinks
    });
  }
  if (metrics.topPostsByComments.length) {
    opportunities.push({
      id: "opportunity:conversation_hooks",
      type: "opportunity",
      label: "Conversation hook posts",
      detail:
        "High-comment posts are better candidates for safe, context-aware conversation hooks.",
      confidence: "medium",
      postIds: metrics.topPostsByComments.map((post) => post.postId),
      urls: metrics.topPostsByComments
        .map((post) => post.url)
        .filter((url): url is string => Boolean(url))
    });
  }
  if (profile.isVerified || posts.some((post) => post.isPinned)) {
    opportunities.push({
      id: "opportunity:positioning",
      type: "opportunity",
      label: "Clear positioning surface",
      detail:
        "Verified or pinned content gives stronger first-read context than a purely chronological feed.",
      confidence: profile.isVerified ? "high" : "medium",
      postIds: posts.filter((post) => post.isPinned).map((post) => post.id)
    });
  }
  return opportunities.slice(0, 8);
}

function profileEvidence(signals: AnalysisContext["profileSignals"]): AnalysisEvidenceItem[] {
  const evidence: AnalysisEvidenceItem[] = [];
  if (signals.professionHints.length) {
    evidence.push({
      id: "profile:profession_hints",
      type: "profile",
      label: "Profession/status hints",
      detail: signals.professionHints.join(", "),
      confidence: "medium"
    });
  }
  if (signals.locationHints.length) {
    evidence.push({
      id: "profile:location_hints",
      type: "profile",
      label: "Coarse location hints",
      detail: signals.locationHints.join(", "),
      confidence: "medium"
    });
  }
  if (signals.publicContacts.length || signals.publicLinks.length) {
    evidence.push({
      id: "profile:published_contacts",
      type: "profile",
      label: "Published contacts/links",
      detail: [...signals.publicContacts, ...signals.publicLinks].slice(0, 8).join(", "),
      confidence: "high",
      urls: signals.publicLinks
    });
  }
  return evidence;
}

function selectionEvidence(selection: PostSelectionResult): AnalysisEvidenceItem[] {
  return selection.selected.slice(0, 12).map((item) => ({
    id: `post:${item.postId}`,
    type: "post",
    label: "Selected evidence post",
    detail: `Selected for ${item.reasons.join(", ")}; score ${item.score}.`,
    confidence: "high",
    postIds: [item.postId],
    urls: item.url ? [item.url] : undefined
  }));
}

function clusterEvidence(clusters: AnalysisContext["contentClusters"]): AnalysisEvidenceItem[] {
  return clusters.slice(0, 8).map((cluster) => ({
    id: `cluster:${cluster.label}`,
    type: "content_cluster",
    label: cluster.label,
    detail: `${cluster.count} selected posts match keywords: ${cluster.keywords.slice(0, 6).join(", ")}`,
    confidence: cluster.count >= 3 ? "high" : "medium",
    postIds: cluster.postIds
  }));
}

function audienceEvidence(signals: AnalysisContext["audienceSignals"]): AnalysisEvidenceItem[] {
  const evidence: AnalysisEvidenceItem[] = [];
  if (signals.frequentCommenters.length) {
    evidence.push({
      id: "audience:frequent_commenters",
      type: "audience",
      label: "Recurring commenters",
      detail: signals.frequentCommenters
        .map((item) => `${item.username} (${item.count})`)
        .join(", "),
      confidence: "medium"
    });
  }
  if (signals.highCommentPostIds.length) {
    evidence.push({
      id: "audience:high_comment_posts",
      type: "audience",
      label: "High-comment posts",
      detail: `${signals.commentDensity} comment density across selected posts.`,
      confidence: "medium",
      postIds: signals.highCommentPostIds
    });
  }
  if (signals.authorReplyCount) {
    evidence.push({
      id: "audience:author_replies",
      type: "audience",
      label: "Author replies in comments",
      detail: `${signals.authorReplyCount} visible author replies across ${signals.authorReplyPostIds.length} selected posts.`,
      confidence: "high",
      postIds: signals.authorReplyPostIds
    });
  }
  if (signals.questionCommentPostIds.length) {
    evidence.push({
      id: "audience:comment_questions",
      type: "audience",
      label: "Question comments",
      detail:
        "Some visible comments ask questions; these are useful for safe, topic-specific hooks.",
      confidence: "medium",
      postIds: signals.questionCommentPostIds
    });
  }
  return evidence;
}

function uniqueById(posts: InstagramPost[]): InstagramPost[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

function hasProfileSignal(post: InstagramPost): boolean {
  const text = [
    post.caption,
    post.hashtags.join(" "),
    post.mentions.join(" "),
    post.taggedUsers.join(" ")
  ]
    .filter(Boolean)
    .join(" ");
  return (
    /https?:\/\/|@[A-Za-z0-9._]{3,32}|email|почт|telegram|whatsapp|link|bio/iu.test(text) ||
    CONTENT_CLUSTERS.some((cluster) => cluster.re.test(text))
  );
}

function timestampMs(post: InstagramPost): number {
  const parsed = Date.parse(post.timestamp ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function topTerms(text: string, limit: number): string[] {
  const stop = new Set([
    "this",
    "that",
    "with",
    "from",
    "для",
    "как",
    "это",
    "что",
    "или",
    "the",
    "and",
    "you",
    "are",
    "на",
    "по",
    "за",
    "из"
  ]);
  return Object.entries(
    frequency(
      text
        .toLowerCase()
        .match(/[\p{L}\p{N}]{3,}/gu)
        ?.filter((word) => !stop.has(word)) ?? []
    )
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

function frequency(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeUsername(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

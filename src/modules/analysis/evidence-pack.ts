import type { AnalysisMode } from "../../telegram/constants.js";
import type { InstagramPost, InstagramProfile } from "../instagram/types.js";
import type { ReportMetrics, VisionAnalysisItemView } from "../reports/types.js";
import type { AnalysisContext, PostSelectionResult } from "./context.js";

export type EvidencePack = {
  version: "evidence-pack.v1";
  mode: AnalysisMode;
  profile: {
    username: string;
    postsCount: number;
    metadataPosts: number;
    visualPosts: number;
    metadataCoveragePercent?: number;
    visualCoveragePercent?: number;
    commentTextCount: number;
    postsWithCommentText: number;
    authorReplyCount: number;
    postsWithAuthorReplies: number;
  };
  coverageNotes: string[];
  topSignals: Array<{
    label: string;
    detail: string;
    confidence: "low" | "medium" | "high";
    postIds?: string[];
    urls?: string[];
  }>;
  themes: Array<{ label: string; count: number; postIds: string[]; confidence: "medium" | "high" }>;
  audience: {
    commentDensity: AnalysisContext["audienceSignals"]["commentDensity"];
    frequentCommenters: AnalysisContext["audienceSignals"]["frequentCommenters"];
    repeatedCommentTerms: AnalysisContext["audienceSignals"]["repeatedCommentTerms"];
    authorReplies: AnalysisContext["audienceSignals"]["authorReplies"];
    questionCommentPostIds: string[];
  };
  visual: {
    completed: number;
    total: number;
    postIds: string[];
    notes: Array<{ postId: string; description: string }>;
  };
  postEvidence: Array<{
    postId: string;
    url?: string;
    timestamp?: string;
    reasons: string[];
    captionSnippet?: string;
    likes: number;
    comments: number;
    authorReplySnippets: string[];
    commentSnippets: string[];
  }>;
  safeHooks: Array<{
    postId: string;
    url?: string;
    hook: string;
    whySafe: string;
    confidence: "low" | "medium" | "high";
  }>;
  noGo: string[];
  confidenceRules: string[];
};

export function buildEvidencePack(input: {
  mode: AnalysisMode;
  profile: InstagramProfile;
  posts: InstagramPost[];
  visualPosts: InstagramPost[];
  selection: PostSelectionResult;
  metrics: ReportMetrics;
  vision: VisionAnalysisItemView[];
  analysisContext: AnalysisContext;
}): EvidencePack {
  const metadataCoveragePercent = percent(input.posts.length, input.profile.postsCount);
  const visualCoveragePercent = percent(input.visualPosts.length, input.profile.postsCount);
  const authorReplies = input.analysisContext.audienceSignals.authorReplies;
  const postsWithCommentText = input.posts.filter((post) =>
    post.latestComments.some((comment) => comment.text.trim())
  ).length;
  const commentTextCount = input.posts.reduce(
    (sum, post) => sum + post.latestComments.filter((comment) => comment.text.trim()).length,
    0
  );
  const postsWithAuthorReplies = new Set(authorReplies.map((reply) => reply.postId)).size;
  const postSelection = new Map(
    input.selection.selected.map((item) => [item.postId, item.reasons])
  );
  const visionByPost = new Map(
    input.vision
      .filter((item) => item.status === "completed" && item.description)
      .map((item) => [item.postId, item.description!])
  );

  const postEvidence = strongestEvidencePosts(input.posts, input.metrics, postSelection).map(
    (post) => ({
      postId: post.id,
      url: post.url,
      timestamp: post.timestamp,
      reasons: postSelection.get(post.id) ?? [],
      captionSnippet: truncate(post.caption, 220),
      likes: post.likesCount,
      comments: post.commentsCount,
      authorReplySnippets: post.latestComments
        .filter((comment) => comment.isAuthor)
        .map((comment) => truncate(comment.text, 120))
        .filter((item): item is string => Boolean(item))
        .slice(0, 3),
      commentSnippets: post.latestComments
        .filter((comment) => !comment.isAuthor && comment.text.trim())
        .map((comment) => truncate(comment.text, 120))
        .filter((item): item is string => Boolean(item))
        .slice(0, 4)
    })
  );

  return {
    version: "evidence-pack.v1",
    mode: input.mode,
    profile: {
      username: input.profile.username,
      postsCount: input.profile.postsCount,
      metadataPosts: input.posts.length,
      visualPosts: input.visualPosts.length,
      metadataCoveragePercent,
      visualCoveragePercent,
      commentTextCount,
      postsWithCommentText,
      authorReplyCount: authorReplies.length,
      postsWithAuthorReplies
    },
    coverageNotes: coverageNotes(
      input.profile.postsCount,
      input.posts.length,
      input.visualPosts.length
    ),
    topSignals: input.analysisContext.evidenceMap.slice(0, 18).map((item) => ({
      label: item.label,
      detail: item.detail,
      confidence: item.confidence,
      postIds: item.postIds,
      urls: item.urls
    })),
    themes: input.analysisContext.contentClusters.slice(0, 8).map((cluster) => ({
      label: cluster.label,
      count: cluster.count,
      postIds: cluster.postIds,
      confidence: cluster.count >= 3 ? "high" : "medium"
    })),
    audience: {
      commentDensity: input.analysisContext.audienceSignals.commentDensity,
      frequentCommenters: input.analysisContext.audienceSignals.frequentCommenters,
      repeatedCommentTerms: input.analysisContext.audienceSignals.repeatedCommentTerms,
      authorReplies: authorReplies.slice(0, 12),
      questionCommentPostIds: input.analysisContext.audienceSignals.questionCommentPostIds
    },
    visual: {
      completed: input.vision.filter((item) => item.status === "completed").length,
      total: input.vision.length,
      postIds: input.visualPosts.map((post) => post.id),
      notes: input.vision
        .filter((item) => item.status === "completed" && item.description)
        .slice(0, 12)
        .map((item) => ({
          postId: item.postId,
          description: truncate(item.description ?? "", 500) ?? ""
        }))
    },
    postEvidence,
    safeHooks: buildSafeHooks(postEvidence, visionByPost),
    noGo: [
      "Do not infer relationships, income, health, identity, private intent, or readiness to reply.",
      "Do not use third-party people in photos as targets or evidence about private relationships.",
      "Do not continue contact without a response or move to non-public channels unless the profile publishes that channel.",
      "Do not mention appearance, status, or private life as an opener."
    ],
    confidenceRules: [
      "Tie every recommendation to a public post, profile field, metric, comment, or vision note.",
      "Use low confidence when the signal comes from absences or partial metadata coverage.",
      "Use medium confidence for repeated public patterns across multiple posts.",
      "Use high confidence only for directly visible or published facts."
    ]
  };
}

function strongestEvidencePosts(
  posts: InstagramPost[],
  metrics: ReportMetrics,
  postSelection: Map<string, string[]>
): InstagramPost[] {
  const topIds = new Set([
    ...metrics.topPostsByComments.map((post) => post.postId),
    ...metrics.topPostsByLikes.map((post) => post.postId),
    ...[...postSelection.keys()].slice(0, 18)
  ]);
  return posts
    .filter((post) => topIds.has(post.id))
    .sort(
      (a, b) =>
        (postSelection.get(b.id)?.length ?? 0) - (postSelection.get(a.id)?.length ?? 0) ||
        b.commentsCount - a.commentsCount ||
        b.likesCount - a.likesCount
    )
    .slice(0, 24);
}

function buildSafeHooks(
  postEvidence: EvidencePack["postEvidence"],
  visionByPost: Map<string, string>
): EvidencePack["safeHooks"] {
  return postEvidence
    .filter(
      (post) => post.captionSnippet || post.commentSnippets.length || visionByPost.has(post.postId)
    )
    .slice(0, 8)
    .map((post) => {
      const anchor = post.captionSnippet
        ? `caption: ${post.captionSnippet}`
        : post.commentSnippets[0]
          ? `comment thread: ${post.commentSnippets[0]}`
          : `visual post ${post.postId}`;
      return {
        postId: post.postId,
        url: post.url,
        hook: `Use one concrete observation from ${anchor}`,
        whySafe:
          "It references only public content from a specific post and avoids private assumptions.",
        confidence:
          post.reasons.includes("high_comments") || post.authorReplySnippets.length
            ? "high"
            : "medium"
      };
    });
}

function coverageNotes(postsCount: number, metadataPosts: number, visualPosts: number): string[] {
  const notes: string[] = [
    `Metadata/caption/comment analysis covers ${metadataPosts}/${postsCount} public posts.`,
    `Vision analysis covers ${visualPosts}/${postsCount} public posts.`
  ];
  if (postsCount > metadataPosts) {
    notes.push("Conclusions must be framed as public-sample signals, not full-profile certainty.");
  }
  return notes;
}

function percent(part: number, total: number): number | undefined {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : undefined;
}

function truncate(value: string | null | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  return compact.length > maxLength ? `${compact.slice(0, Math.max(0, maxLength - 1))}…` : compact;
}

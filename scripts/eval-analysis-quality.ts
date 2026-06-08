import { buildAnalysisContext, selectAnalysisPosts } from "../src/modules/analysis/context.js";
import { evaluateReportQuality } from "../src/modules/analysis/report-quality.js";
import type { InstagramPost, InstagramProfile } from "../src/modules/instagram/types.js";
import { computeReportMetrics } from "../src/modules/reports/metrics.js";
import type { ReportSectionView, VisionAnalysisItemView } from "../src/modules/reports/types.js";

const posts: InstagramPost[] = [
  post("recent", {
    caption: "Weekly note about product work and public launch",
    likesCount: 90,
    commentsCount: 5,
    timestamp: "2026-06-08T08:00:00Z"
  }),
  post("pinned", {
    caption: "Pinned founder intro with email hello@example.com and launch story",
    likesCount: 150,
    commentsCount: 18,
    timestamp: "2026-05-01T08:00:00Z",
    isPinned: true
  }),
  post("comments", {
    caption: "Community workshop recap with practical tips and guide",
    likesCount: 60,
    commentsCount: 80,
    timestamp: "2026-04-01T08:00:00Z",
    latestComments: [
      { ownerUsername: "alex", text: "useful guide and practical checklist" },
      { ownerUsername: "alex", text: "when is the next workshop?" },
      { ownerUsername: "sam", text: "great community event" }
    ]
  }),
  post("promo", {
    caption: "Sponsored brand promo with discount and partner mention",
    likesCount: 120,
    commentsCount: 6,
    timestamp: "2026-03-01T08:00:00Z"
  })
];

const profile: InstagramProfile = {
  username: "eval_founder",
  fullName: "Eval Founder",
  biography: "Founder and product coach. Contact: hello@example.com",
  followersCount: 2500,
  followsCount: 400,
  postsCount: 120,
  externalUrl: "https://example.com",
  isVerified: false,
  relatedProfiles: ["partner"],
  posts
};

const selection = selectAnalysisPosts(posts, { limit: 3 });
const metrics = computeReportMetrics({ ...profile, posts: selection.posts }, selection.posts);
const vision: VisionAnalysisItemView[] = selection.posts.map((item) => ({
  postId: item.id,
  status: "completed",
  description: `[Image ID: ${item.id}] Visible fact: public work context and clean product visuals.`,
  model: "eval",
  promptVersion: "eval"
}));
const analysisContext = buildAnalysisContext({
  mode: "influencer",
  profile: { ...profile, posts: selection.posts },
  posts: selection.posts,
  selection,
  metrics,
  vision
});

const weakQuality = evaluateReportQuality({
  mode: "influencer",
  sections: [
    {
      title: "Brand safety",
      content: "This is an interesting public profile with recurring patterns.",
      sources: []
    }
  ],
  metrics,
  analysisContext
});
const strongQuality = evaluateReportQuality({
  mode: "influencer",
  sections: sourceBackedSections(),
  metrics,
  analysisContext
});

const checks = [
  {
    name: "selects pinned evidence",
    pass: selection.selected.some(
      (item) => item.postId === "pinned" && item.reasons.includes("pinned")
    )
  },
  {
    name: "selects high-comment evidence",
    pass: selection.selected.some(
      (item) => item.postId === "comments" && item.reasons.includes("high_comments")
    )
  },
  {
    name: "builds evidence map",
    pass: analysisContext.evidenceMap.length >= 4
  },
  {
    name: "extracts published contact signal",
    pass: analysisContext.profileSignals.publicContacts.includes("hello@example.com")
  },
  {
    name: "flags weak report below strong report",
    pass: weakQuality.score < strongQuality.score
  }
];

for (const check of checks) {
  console.log(`${check.pass ? "OK" : "FAIL"} ${check.name}`);
}
console.log("");
console.log(`selected posts: ${selection.selected.map((item) => item.postId).join(", ")}`);
console.log(`evidence items: ${analysisContext.evidenceMap.length}`);
console.log(`weak quality score: ${weakQuality.score}`);
console.log(`strong quality score: ${strongQuality.score}`);

if (checks.some((check) => !check.pass)) {
  process.exit(1);
}

function sourceBackedSections(): ReportSectionView[] {
  return [
    {
      title: "Brand safety",
      content:
        "Brand safety signal is medium confidence: visible content stays around public product work, workshops, and promo posts. The main caveat is that a sponsored post appears in the selected sample, so ad saturation should be checked before a campaign.",
      sources: [
        { postId: "pinned", url: "https://www.instagram.com/p/pinned/", label: "Pinned intro" }
      ]
    },
    {
      title: "Audience quality",
      content:
        "Audience quality signal is medium confidence: the high-comment workshop post has repeated practical questions, which is stronger than likes alone. This remains a public-data hypothesis because only latest comments are available.",
      sources: [
        {
          postId: "comments",
          url: "https://www.instagram.com/p/comments/",
          label: "Workshop comments"
        }
      ]
    }
  ];
}

function post(id: string, overrides: Partial<InstagramPost>): InstagramPost {
  return {
    id,
    type: "Image",
    caption: "",
    hashtags: [],
    mentions: [],
    likesCount: 1,
    commentsCount: 0,
    latestComments: [],
    timestamp: "2026-01-01T00:00:00Z",
    url: `https://www.instagram.com/p/${id}/`,
    isPinned: false,
    childPosts: [],
    taggedUsers: [],
    ...overrides
  };
}

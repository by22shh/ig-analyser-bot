export type InstagramComment = {
  ownerUsername?: string;
  text: string;
  timestamp?: string;
};

export type InstagramPost = {
  id: string;
  type: string;
  caption?: string;
  hashtags: string[];
  mentions: string[];
  likesCount: number;
  commentsCount: number;
  latestComments: InstagramComment[];
  timestamp?: string;
  displayUrl?: string;
  mediaUrls?: string[];
  url?: string;
  videoViewCount?: number;
  videoDuration?: number;
  location?: { name?: string; [key: string]: unknown };
  isPinned: boolean;
  productType?: string;
  musicInfo?: { songName?: string; artistName?: string; [key: string]: unknown };
  childPosts: string[];
  taggedUsers: string[];
};

export type InstagramProfile = {
  username: string;
  fullName?: string;
  biography?: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  profilePicUrl?: string;
  externalUrl?: string;
  isVerified: boolean;
  relatedProfiles: string[];
  posts: InstagramPost[];
  providerDatasetId?: string;
  rawDebug?: unknown;
};

export type FetchInstagramProfileInput = {
  username: string;
  postLimit: number;
  includeParentData: boolean;
};

export interface InstagramProfileProvider {
  fetchProfile(input: FetchInstagramProfileInput): Promise<InstagramProfile>;
}

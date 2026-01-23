export type PostAuthor = {
  id: string;
  email?: string | null;
  username: string | null;
  name: string | null;
  displayName?: string | null;
  image: string | null;
};

export type ViewerState = {
  isFollowing: boolean;
  isFriend: boolean;
  isMe: boolean;
};

export type PostWithMeta = {
  id: number | string;
  content: string;
  createdAt: string;
  replyToId: number | null;
  deletedAt?: string | null;
  canViewDeleted?: boolean;
  author: PostAuthor;
  _count: {
    likes: number;
    replies: number;
  };
  viewerHasLiked: boolean;
  viewCount?: number;
  sending?: boolean;
};

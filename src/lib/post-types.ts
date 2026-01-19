export type PostAuthor = {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
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

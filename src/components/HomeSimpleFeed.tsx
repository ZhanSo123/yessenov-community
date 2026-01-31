"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";

type PostAuthor = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

type Post = {
  id: number;
  content: string;
  createdAt: string;
  author: PostAuthor;
};

type PostsResponse = {
  data?: Post[];
  error?: string;
};

type PostResponse = {
  data?: Post;
  error?: string;
};

export default function HomeSimpleFeed() {
  const { status } = useSession();
  const isAuthed = status === "authenticated";
  const isSessionLoading = status === "loading";

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const loadPosts = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/posts", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load posts.");
      }

      const payload = (await response.json()) as PostsResponse;
      setPosts(payload.data ?? []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Load error."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthed) {
      loadPosts();
      return;
    }

    setPosts([]);
    setError("");
    setContent("");
  }, [isAuthed]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!isAuthed) {
      setError("Sign in to publish posts.");
      return;
    }

    const trimmed = content.trim();
    if (trimmed.length < 1) {
      setError("Enter post content.");
      return;
    }
    if (trimmed.length > 500) {
      setError("Max 500 characters.");
      return;
    }

    setPosting(true);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });

      if (response.status === 401) {
        setError("Session expired. Sign in again.");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to publish post.");
      }

      const payload = (await response.json()) as PostResponse;
      if (!payload.data) {
        throw new Error("Failed to publish post.");
      }

      setPosts((current) => [payload.data as Post, ...current]);
      setContent("");
    } catch (postError) {
      setError(
        postError instanceof Error ? postError.message : "Publish error."
      );
    } finally {
      setPosting(false);
    }
  };

  const renderAuthor = (author: PostAuthor) =>
    author.name ?? author.email ?? "User";

  return (
    <div className="relative min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-16 pt-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Threads Feed
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            What is new in the community
          </h1>
          <p className="text-sm text-slate-600">
            Short posts and discussions feed.
          </p>
        </header>

        {isSessionLoading ? (
          <p className="text-sm text-slate-500">Loading session...</p>
        ) : null}

        {!isSessionLoading && !isAuthed ? (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600">
            <p>Sign in to see the feed and create posts.</p>
            <button
              type="button"
              onClick={() => signIn("google")}
              className="bubble-btn-primary mt-4 inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold pressable"
            >
              Google Sign In
            </button>
          </div>
        ) : null}

        {!isSessionLoading && isAuthed ? (
          <>
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm"
            >
              <label className="text-sm font-semibold text-slate-700">
                New post
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  maxLength={500}
                  className="mt-3 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="What's new?"
                  disabled={posting}
                />
              </label>
              {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
              <button
                type="submit"
                disabled={posting}
                className="bubble-btn-primary mt-3 inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 pressable"
              >
                {posting ? "Publishing..." : "Post"}
              </button>
            </form>

            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : null}
            {!loading && posts.length === 0 ? (
              <p className="text-sm text-slate-500">No posts yet.</p>
            ) : null}

            <section className="space-y-4">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-sm text-slate-700">
                      {post.author.image ? (
                        <img
                          src={post.author.image}
                          alt={renderAuthor(post.author)}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                          {renderAuthor(post.author).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className="font-semibold text-slate-900">
                        {renderAuthor(post.author)}
                      </span>
                    </div>
                    <time className="text-xs text-slate-400">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{post.content}</p>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

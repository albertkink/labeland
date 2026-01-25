import { useEffect, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";

type BlogPost = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export default function Home() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/blog")
      .then(async (r) => {
        const raw = await r.text();
        let data: unknown = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = null;
        }
        if (!r.ok) {
          const msg =
            data && typeof data === "object" && "error" in data
              ? String((data as { error?: unknown }).error)
              : `Failed to load blog (HTTP ${r.status}).`;
          throw new Error(msg);
        }
        const list =
          data && typeof data === "object"
            ? (data as { posts?: unknown }).posts
            : null;
        return Array.isArray(list) ? (list as BlogPost[]) : [];
      })
      .then((list) => {
        if (!cancelled) setPosts(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load blog.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageMeta
        title="Bug Fix Blog | Labelz"
        description="Latest bug fixes and updates."
      />
      <div className="space-y-6">
        <ComponentCard
          title="Bug Fix Blog"
          desc="Latest bug fixes and updates. Managed by admins."
        >
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading…
            </p>
          ) : error ? (
            <div className="rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
              {error}
            </div>
          ) : posts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No posts yet. Admins can add bug fix entries from the Admin panel.
            </p>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-800 dark:bg-white/[0.03]"
                >
                  <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                    {post.title}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(post.updatedAt).toLocaleString()}
                  </p>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                    {post.content}
                  </div>
                </article>
              ))}
            </div>
          )}
        </ComponentCard>
      </div>
    </>
  );
}

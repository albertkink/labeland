import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import TextArea from "../../components/form/input/TextArea";
import Button from "../../components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

type BlogPost = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

const getToken = () => localStorage.getItem("auth.token") || "";

export default function AdminDashboard() {
  const token = useMemo(() => getToken(), []);
  const isAuthed = Boolean(token);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const authedFetch = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
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
          : raw || `Request failed (HTTP ${r.status}).`;
      throw new Error(msg);
    }
    return data;
  };

  const refresh = async () => {
    setError(null);
    setInfo(null);
    if (!isAuthed) return;
    try {
      const resp = (await authedFetch("/api/admin/blog")) as { posts?: BlogPost[] };
      setPosts(Array.isArray(resp.posts) ? resp.posts : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load blog.");
    }
  };

  useEffect(() => {
    void refresh();
  }, [isAuthed]);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setEditingId(null);
  };

  const handleCreate = async () => {
    setError(null);
    setInfo(null);
    const t = title.trim();
    if (!t) {
      setError("Title is required.");
      return;
    }
    try {
      await authedFetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, content: content.trim() }),
      });
      setInfo("Post created.");
      resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create post.");
    }
  };

  const handleEdit = (post: BlogPost) => {
    setTitle(post.title);
    setContent(post.content);
    setEditingId(post.id);
    setError(null);
    setInfo(null);
  };

  const handleUpdate = async () => {
    setError(null);
    setInfo(null);
    if (!editingId) return;
    const t = title.trim();
    if (!t) {
      setError("Title is required.");
      return;
    }
    try {
      await authedFetch(`/api/admin/blog/${encodeURIComponent(editingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, content: content.trim() }),
      });
      setInfo("Post updated.");
      resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update post.");
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setInfo(null);
    try {
      await authedFetch(`/api/admin/blog/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setInfo("Post deleted.");
      if (editingId === id) resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete post.");
    }
  };

  return (
    <div>
      <PageMeta title="Admin | Labelz" description="Bug fix blog admin" />
      <PageBreadcrumb pageTitle="Admin" />

      {!isAuthed ? (
        <ComponentCard
          title="Admin"
          desc="You must be signed in as an administrator to view this page."
        >
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Please sign in. The first account is admin by default, or set
            ADMIN_EMAILS on the server to grant admin by email.
          </div>
        </ComponentCard>
      ) : (
        <div className="space-y-6">
          {error ? (
            <div className="rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
              {error}
            </div>
          ) : null}
          {info ? (
            <div className="rounded-lg border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-700 dark:text-success-400">
              {info}
            </div>
          ) : null}

          <ComponentCard
            title="Bug Fix Blog"
            desc="Create, edit, and remove blog posts. Shown on the main page."
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="blog-title">Title</Label>
                <Input
                  id="blog-title"
                  placeholder="Bug fix: XYZ"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="blog-content">Content</Label>
                <TextArea
                  rows={6}
                  placeholder="Describe the fix..."
                  value={content}
                  onChange={(v) => setContent(v)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {editingId ? (
                  <>
                    <Button variant="primary" onClick={handleUpdate}>
                      Save changes
                    </Button>
                    <Button variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" onClick={handleCreate}>
                    Add post
                  </Button>
                )}
                <Button variant="outline" onClick={() => void refresh()}>
                  Refresh
                </Button>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Title
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Updated
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {posts.length === 0 ? (
                      <TableRow>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                          No posts yet.
                        </TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                      </TableRow>
                    ) : (
                      posts.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="px-5 py-4 text-sm text-gray-800 dark:text-white/90">
                            {p.title}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {new Date(p.updatedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-end">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => handleEdit(p)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => handleDelete(p.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ComponentCard>
        </div>
      )}
    </div>
  );
}

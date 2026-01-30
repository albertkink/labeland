import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
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
import { Modal } from "../../components/ui/modal";
import { PDFDocument } from "pdf-lib";

type BlogPost = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type AdminLabel = {
  id: string;
  userId: string;
  username?: string;
  status: "pending" | "done" | "cancelled";
  declineReason?: string | null;
  labelData: Record<string, unknown>;
  files: { filename: string; originalName?: string }[];
  createdAt: string;
  updatedAt: string;
};

type AccountProduct = {
  id: string;
  service: string;
  informations: string;
  country: string;
  priceUsd: number;
  createdAt: string;
  updatedAt: string;
};

const getToken = () => localStorage.getItem("auth.token") || "";

const getUser = () => {
  try {
    const raw = localStorage.getItem("auth.user");
    return raw ? (JSON.parse(raw) as { isAdmin?: boolean }) : null;
  } catch {
    return null;
  }
};

export default function AdminDashboard() {
  const token = useMemo(() => getToken(), []);
  const user = useMemo(() => getUser(), []);
  const isAuthed = Boolean(token);
  const isAdmin = Boolean(user?.isAdmin);
  const location = useLocation();

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [labels, setLabels] = useState<AdminLabel[]>([]);
  const [accountProducts, setAccountProducts] = useState<AccountProduct[]>([]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [productService, setProductService] = useState("");
  const [productInformations, setProductInformations] = useState("");
  const [productCountry, setProductCountry] = useState("");
  const [productPriceUsd, setProductPriceUsd] = useState("");

  const [doneModal, setDoneModal] = useState<{ open: boolean; labelId: string | null }>({
    open: false,
    labelId: null,
  });
  const [declineModal, setDeclineModal] = useState<{
    open: boolean;
    labelId: string | null;
    reason: string;
  }>({ open: false, labelId: null, reason: "" });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [pdfMergeFiles, setPdfMergeFiles] = useState<File[]>([]);
  const [pdfMergeMerging, setPdfMergeMerging] = useState(false);
  const pdfMergeInputRef = useRef<HTMLInputElement | null>(null);

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

  const refreshLabels = useCallback(async () => {
    if (!isAuthed || !token) return;
    try {
      const r = await fetch("/api/admin/labels", {
        headers: { Authorization: `Bearer ${token}` },
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
            : `Request failed (HTTP ${r.status}).`;
        throw new Error(msg);
      }
      const resp = data as { labels?: AdminLabel[] };
      setLabels(Array.isArray(resp.labels) ? resp.labels : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load labels.");
    }
  }, [isAuthed, token]);

  useEffect(() => {
    if (isAuthed && isAdmin) void refresh();
  }, [isAuthed, isAdmin]);

  useEffect(() => {
    if (isAuthed && isAdmin) void refreshLabels();
  }, [isAuthed, isAdmin, refreshLabels]);

  useEffect(() => {
    if (location.hash === "#account-products") {
      const el = document.getElementById("account-products");
      el?.scrollIntoView({ behavior: "smooth" });
    }
  }, [location.hash]);

  const refreshAccountProducts = useCallback(async () => {
    if (!isAuthed || !token) return;
    try {
      const r = await fetch("/api/account-products");
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
            : `Request failed (HTTP ${r.status}).`;
        throw new Error(msg);
      }
      const resp = data as { products?: AccountProduct[] };
      setAccountProducts(Array.isArray(resp.products) ? resp.products : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load account products.");
    }
  }, [isAuthed, token]);

  useEffect(() => {
    if (isAuthed && isAdmin) void refreshAccountProducts();
  }, [isAuthed, isAdmin, refreshAccountProducts]);

  const resetProductForm = () => {
    setProductService("");
    setProductInformations("");
    setProductCountry("");
    setProductPriceUsd("");
  };

  const handleCreateProduct = async () => {
    setError(null);
    setInfo(null);
    const service = productService.trim();
    const country = productCountry.trim();
    const priceUsd = Number(productPriceUsd);

    if (!service) {
      setError("Service is required.");
      return;
    }
    if (!country) {
      setError("Country is required.");
      return;
    }
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      setError("Valid price is required.");
      return;
    }

    try {
      await authedFetch("/api/admin/account-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          informations: productInformations.trim(),
          country,
          priceUsd,
        }),
      });
      setInfo("Account product created.");
      resetProductForm();
      await refreshAccountProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create product.");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    setError(null);
    setInfo(null);
    try {
      await authedFetch(`/api/admin/account-products/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setInfo("Product deleted.");
      await refreshAccountProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete product.");
    }
  };

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

  const openDoneModal = (labelId: string) => {
    setDoneModal({ open: true, labelId });
    setError(null);
    setInfo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const closeDoneModal = () => setDoneModal({ open: false, labelId: null });
  const openDeclineModal = (labelId: string) => {
    setDeclineModal({ open: true, labelId, reason: "" });
    setError(null);
    setInfo(null);
  };
  const closeDeclineModal = () =>
    setDeclineModal({ open: false, labelId: null, reason: "" });

  const handleDoneSubmit = async () => {
    const labelId = doneModal.labelId;
    if (!labelId || !token) return;
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      setError("Select at least one file to upload.");
      return;
    }
    setError(null);
    setInfo(null);
    setUploading(true);
    try {
      const form = new FormData();
      for (let i = 0; i < files.length; i++) {
        form.append("files", files[i]);
      }
      const r = await fetch(`/api/admin/labels/${encodeURIComponent(labelId)}/done`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
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
            : `Upload failed (HTTP ${r.status}).`;
        throw new Error(msg);
      }
      setInfo("Label marked as done. Files uploaded.");
      closeDoneModal();
      await refreshLabels();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeclineSubmit = async () => {
    const labelId = declineModal.labelId;
    const reason = declineModal.reason.trim();
    if (!labelId || !token) return;
    if (!reason) {
      setError("Please enter a reason why the label cannot be done.");
      return;
    }
    setError(null);
    setInfo(null);
    try {
      await authedFetch(`/api/admin/labels/${encodeURIComponent(labelId)}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setInfo("Label declined.");
      closeDeclineModal();
      await refreshLabels();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decline failed.");
    }
  };

  const handlePdfMergeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const pdfs = Array.from(files).filter(
      (f) => f.type === "application/pdf"
    );
    setPdfMergeFiles(pdfs);
  };

  const handlePdfMerge = async () => {
    if (pdfMergeFiles.length === 0) {
      setError("Select at least one PDF file.");
      return;
    }
    setError(null);
    setInfo(null);
    setPdfMergeMerging(true);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const file of pdfMergeFiles) {
        const bytes = await file.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const pageCount = src.getPageCount();
        const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
        const [copiedPages] = await mergedPdf.copyPages(src, pageIndices);
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `label-land-docs-${pdfMergeFiles.length}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setInfo(`Merged ${pdfMergeFiles.length} PDF(s) and downloaded.`);
      setPdfMergeFiles([]);
      if (pdfMergeInputRef.current) pdfMergeInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to merge PDFs.");
    } finally {
      setPdfMergeMerging(false);
    }
  };

  const labelSummary = (l: AdminLabel) => {
    const d = l.labelData as { carrier?: string; service?: string; from?: { name?: string } };
    const carrier = d?.carrier ?? "—";
    const service = d?.service ?? "—";
    const from = d?.from?.name ?? "—";
    return `${String(carrier).toUpperCase()} • ${service} • ${from}`;
  };

  return (
    <div>
      <PageMeta title="Admin | Label Land" description="Bug fix blog admin" />
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
      ) : !isAdmin ? (
        <ComponentCard
          title="Admin"
          desc="Access restricted to administrators."
        >
          <div className="text-sm text-gray-600 dark:text-gray-400">
            You must be an administrator to manage blog posts, labels, and
            account market items. Contact an admin or set ADMIN_EMAILS on the
            server to grant access.
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

          <ComponentCard
            title="Merge PDFs"
            desc="Upload multiple PDFs to merge into one file. Downloaded as label-land-docs-{number}.pdf."
          >
            <div className="space-y-4">
              <div>
                <Label>PDF files</Label>
                <input
                  ref={pdfMergeInputRef}
                  type="file"
                  multiple
                  accept="application/pdf"
                  onChange={handlePdfMergeFileChange}
                  className="mt-2 block w-full text-sm text-gray-600 dark:text-gray-400 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:hover:bg-brand-600"
                />
              </div>
              {pdfMergeFiles.length > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {pdfMergeFiles.length} PDF(s) selected. Merged file will be named{" "}
                  <span className="font-medium text-gray-800 dark:text-white/90">
                    label-land-docs-{pdfMergeFiles.length}.pdf
                  </span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() => void handlePdfMerge()}
                  disabled={pdfMergeMerging || pdfMergeFiles.length === 0}
                >
                  {pdfMergeMerging ? "Merging…" : "Merge & download"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPdfMergeFiles([]);
                    if (pdfMergeInputRef.current) pdfMergeInputRef.current.value = "";
                  }}
                  disabled={pdfMergeMerging}
                >
                  Clear
                </Button>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard
            title="Labels"
            desc="Label requests from users. Use Done to upload documents, or Decline with a reason."
          >
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        User
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Summary
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Created
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Status
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {labels.length === 0 ? (
                      <TableRow>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400" colSpan={5}>
                          No label requests yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      labels.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="px-5 py-4 text-sm text-gray-800 dark:text-white/90">
                            {l.username ?? l.userId}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            {labelSummary(l)}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {new Date(l.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {l.status}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-end">
                            {l.status === "pending" ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => openDoneModal(l.id)}
                                >
                                  Done
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDeclineModal(l.id)}
                                >
                                  Decline
                                </Button>
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard
            id="account-products"
            title="Account market"
            desc="Add and manage items for the Account Store. These products appear on the Accounts for Sale page."
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="product-service">Service *</Label>
                <Input
                  id="product-service"
                  placeholder="e.g. FedEx Account"
                  value={productService}
                  onChange={(e) => setProductService(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="product-informations">Informations</Label>
                <TextArea
                  id="product-informations"
                  rows={3}
                  placeholder="Additional information about the account..."
                  value={productInformations}
                  onChange={(v) => setProductInformations(v)}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="product-country">Country *</Label>
                  <Input
                    id="product-country"
                    placeholder="e.g. United States"
                    value={productCountry}
                    onChange={(e) => setProductCountry(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="product-price">Price (USD) *</Label>
                  <Input
                    id="product-price"
                    type="number"
                    min="0"
                    step={0.01}
                    placeholder="0.00"
                    value={productPriceUsd}
                    onChange={(e) => setProductPriceUsd(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleCreateProduct}>
                  Add product
                </Button>
                <Button variant="outline" onClick={resetProductForm}>
                  Clear
                </Button>
                <Button variant="outline" onClick={() => void refreshAccountProducts()}>
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
                        Service
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Informations
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Country
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Price
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {accountProducts.length === 0 ? (
                      <TableRow>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400" colSpan={5}>
                          No account products yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      accountProducts.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="px-5 py-4 text-sm text-gray-800 dark:text-white/90">
                            {p.service}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {p.informations || "—"}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {p.country}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                            ${p.priceUsd.toFixed(2)}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteProduct(p.id)}
                            >
                              Delete
                            </Button>
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

      <Modal
        isOpen={doneModal.open}
        onClose={closeDoneModal}
        className="max-w-[500px] m-4 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Upload documents (Done)
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Upload all files the user will download for this label.
        </p>
        <div className="mt-4">
          <Label>Files</Label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="mt-2 block w-full text-sm text-gray-600 dark:text-gray-400 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:hover:bg-brand-600"
            accept="*/*"
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={closeDoneModal} disabled={uploading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleDoneSubmit()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload & mark done"}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={declineModal.open}
        onClose={closeDeclineModal}
        className="max-w-[500px] m-4 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Decline label
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Explain why this label cannot be done. The user will see this message.
        </p>
        <div className="mt-4">
          <Label htmlFor="decline-reason">Reason</Label>
          <TextArea
            id="decline-reason"
            rows={4}
            placeholder="e.g. Invalid address, missing customs info…"
            value={declineModal.reason}
            onChange={(v) =>
              setDeclineModal((prev) => ({ ...prev, reason: v }))
            }
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={closeDeclineModal}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleDeclineSubmit()}>
            Decline
          </Button>
        </div>
      </Modal>
    </div>
  );
}

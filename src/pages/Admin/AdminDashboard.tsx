import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

type AccountProduct = {
  id: string;
  createdAt: string;
  enabled: boolean;
  productName: string;
  priceUsd: number;
  country: string;
  numberOfShipments: number;
};

type Order = {
  orderId: string;
  createdAt: string;
  status: "pending" | "paid" | string;
  paymentMethod: "coinbase" | "credits" | string;
  totalUsd?: number;
  currency?: string;
  items?: unknown[];
  user?: { id: string; email: string } | null;
};

const getToken = () => localStorage.getItem("auth.token") || "";

export default function AdminDashboard() {
  const token = useMemo(() => getToken(), []);
  const isAuthed = Boolean(token);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<AccountProduct[]>([]);

  const [productName, setProductName] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [country, setCountry] = useState("");
  const [numberOfShipments, setNumberOfShipments] = useState("");

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
      const ordersResp = (await authedFetch("/api/admin/orders")) as {
        orders?: unknown;
      };
      const productsResp = (await authedFetch("/api/admin/account-products")) as {
        products?: unknown;
      };
      setOrders(Array.isArray(ordersResp.orders) ? (ordersResp.orders as Order[]) : []);
      setProducts(
        Array.isArray(productsResp.products)
          ? (productsResp.products as AccountProduct[])
          : [],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data.");
    }
  };

  useEffect(() => {
    void refresh();
    // token intentionally stable from memo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddProduct = async () => {
    setError(null);
    setInfo(null);
    try {
      const payload = {
        productName: productName.trim(),
        priceUsd: Number(priceUsd),
        country: country.trim(),
        numberOfShipments: Number(numberOfShipments),
      };
      const data = (await authedFetch("/api/admin/account-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })) as { product?: AccountProduct };
      setInfo(`Added "${data.product?.productName ?? payload.productName}".`);
      setProductName("");
      setPriceUsd("");
      setCountry("");
      setNumberOfShipments("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add product.");
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete product.");
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setError(null);
    setInfo(null);
    try {
      await authedFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      setInfo("Order deleted.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete order.");
    }
  };

  const orderStats = (o: Order) => {
    const items = Array.isArray(o.items) ? o.items : [];
    let labels = 0;
    let accounts = 0;
    for (const it of items) {
      if (it && typeof it === "object" && "kind" in it) {
        const kind = String((it as { kind?: unknown }).kind || "");
        if (kind === "label") labels += 1;
        if (kind === "account") accounts += 1;
      }
    }
    return { labels, accounts, totalItems: items.length };
  };

  return (
    <div>
      <PageMeta title="Admin | Labelz" description="Admin dashboard" />
      <PageBreadcrumb pageTitle="Admin" />

      {!isAuthed ? (
        <ComponentCard
          title="Admin"
          desc="You must be signed in as an administrator to view this page."
        >
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Please sign in. The first account is admin by default, or set
            `ADMIN_EMAILS` on the server to grant admin by email.
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
            title="Orders (Labels + Accounts)"
            desc="All purchases created via Coinbase or Credits."
          >
            <div className="mb-4 flex justify-end">
              <Button variant="outline" onClick={refresh}>
                Refresh
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Order ID
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Status
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Payment
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Items
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Total
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                          No orders yet.
                        </TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                      </TableRow>
                    ) : (
                      orders.map((o) => {
                        const s = orderStats(o);
                        return (
                          <TableRow key={o.orderId}>
                            <TableCell className="px-5 py-4 text-sm text-gray-800 dark:text-white/90">
                              {o.orderId}
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {new Date(o.createdAt).toLocaleString()}
                              </div>
                              {o.user?.email ? (
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {o.user.email}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {o.status}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {o.paymentMethod}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {s.totalItems} (labels: {s.labels}, accounts: {s.accounts})
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                              {typeof o.totalUsd === "number"
                                ? `$${o.totalUsd.toFixed(2)}`
                                : "—"}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-end">
                              <Button
                                variant="outline"
                                onClick={() => handleDeleteOrder(o.orderId)}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard
            title="Account Store Products"
            desc="Add products that appear in Accounts Store."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <Label htmlFor="productName">Product Name</Label>
                <Input
                  id="productName"
                  placeholder="FedEx Account (Starter)"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="priceUsd">Price (USD)</Label>
                <Input
                  id="priceUsd"
                  type="number"
                  min="0"
                  step={0.01}
                  placeholder="49"
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  placeholder="United States"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="shipments">Number of Shipments</Label>
                <Input
                  id="shipments"
                  type="number"
                  min="0"
                  step={1}
                  placeholder="25"
                  value={numberOfShipments}
                  onChange={(e) => setNumberOfShipments(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button variant="primary" onClick={handleAddProduct}>
                  Add Product
                </Button>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Product Name
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Price
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Country
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Shipments
                      </TableCell>
                      <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {products.length === 0 ? (
                      <TableRow>
                        <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                          No products yet.
                        </TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                        <TableCell className="px-5 py-4">&nbsp;</TableCell>
                      </TableRow>
                    ) : (
                      products.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="px-5 py-4 text-sm text-gray-800 dark:text-white/90">
                            {p.productName}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            ${p.priceUsd.toFixed(2)}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            {p.country}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            {p.numberOfShipments}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-end">
                            <Button
                              variant="outline"
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
    </div>
  );
}


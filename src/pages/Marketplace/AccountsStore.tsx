import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import Button from "../../components/ui/button/Button";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Modal } from "../../components/ui/modal";
import { useCart, type CartAccountItem } from "../../context/CartContext";

type Product = {
  id: string;
  service: string;
  informations: string;
  country: string;
  priceUsd: number;
};

type PaymentModalState = {
  open: boolean;
  product: Product | null;
};

export default function AccountsStore() {
  const { addItem } = useCart();
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentModal, setPaymentModal] = useState<PaymentModalState>({
    open: false,
    product: null,
  });

  const [serviceQuery, setServiceQuery] = useState("");
  const [country, setCountry] = useState("");
  const [priceSort, setPriceSort] = useState<"none" | "asc" | "desc">("none");

  const isAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem("auth.user");
      const user = raw ? (JSON.parse(raw) as { isAdmin?: boolean }) : null;
      return Boolean(user?.isAdmin);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    fetch("/api/account-products")
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
              : `Failed to load products (HTTP ${r.status}).`;
          throw new Error(msg);
        }
        const list =
          data && typeof data === "object"
            ? (data as { products?: unknown }).products
            : null;
        if (!Array.isArray(list)) return [];
        return list as Product[];
      })
      .then((list) => {
        if (cancelled) return;
        setProducts(Array.isArray(list) ? list : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load products.");
        setProducts([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const countryOptions = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.country))).sort();
    return unique;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();

    let list = products.slice();

    if (q) {
      list = list.filter((p) => p.service.toLowerCase().includes(q));
    }
    if (country) {
      list = list.filter((p) => p.country === country);
    }

    if (priceSort === "asc") {
      list.sort((a, b) => a.priceUsd - b.priceUsd);
    } else if (priceSort === "desc") {
      list.sort((a, b) => b.priceUsd - a.priceUsd);
    }

    return list;
  }, [products, serviceQuery, country, priceSort]);

  const handleAddToCart = (p: Product) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const item: CartAccountItem = {
      id,
      createdAt: new Date().toISOString(),
      kind: "account",
      productName: p.service,
      priceUsd: p.priceUsd,
      country: p.country,
      numberOfShipments: 0, // Not used in new structure
    };

    addItem(item);
    setMessage(`Added "${p.service}" to cart.`);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleBuyNow = (p: Product) => {
    setPaymentModal({ open: true, product: p });
  };

  const closePaymentModal = () => {
    setPaymentModal({ open: false, product: null });
  };

  const handlePaymentWithCredits = async () => {
    if (!paymentModal.product) return;
    // TODO: Implement credits payment
    setMessage("Credits payment not yet implemented.");
    closePaymentModal();
  };

  const handlePaymentWithCoinbase = async () => {
    if (!paymentModal.product) return;
    try {
      const response = await fetch("/api/coinbase/create-charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth.token") || ""}`,
        },
        body: JSON.stringify({
          items: [
            {
              kind: "account",
              productName: paymentModal.product.service,
              priceUsd: paymentModal.product.priceUsd,
              country: paymentModal.product.country,
              numberOfShipments: 0,
            },
          ],
        }),
      });

      const data = await response.json();
      if (data.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setMessage(data.error || "Failed to create payment.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to create payment.");
    }
    closePaymentModal();
  };

  return (
    <div>
      <PageMeta
        title="Accounts Store | Labelz"
        description="Browse shipping accounts for purchase."
      />
      <PageBreadcrumb pageTitle="Account Store" />

      <ComponentCard
        title="Accounts for Sale"
        desc='Browse and purchase accounts. Columns: "Service", "Informations", "Country", "Price"'
      >
        {loadError ? (
          <div className="mb-4 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
            {loadError}
          </div>
        ) : null}
        {message ? (
          <div className="mb-4 rounded-lg border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-700 dark:text-success-400">
            {message}
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label htmlFor="serviceFilter">Service</Label>
              <Input
                id="serviceFilter"
                placeholder="Search by service..."
                value={serviceQuery}
                onChange={(e) => setServiceQuery(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="countryFilter">Country</Label>
              <select
                id="countryFilter"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              >
                <option value="">All</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="priceSort">Price</Label>
              <select
                id="priceSort"
                value={priceSort}
                onChange={(e) =>
                  setPriceSort(e.target.value as "none" | "asc" | "desc")
                }
                className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              >
                <option value="none">Default</option>
                <option value="asc">Lower to Higher</option>
                <option value="desc">Higher to Lower</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {isAdmin ? (
                <Link
                  to="/admin#account-products"
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-600"
                >
                  Add to account market
                </Link>
              ) : null}
              <div className="text-sm text-gray-600 dark:text-gray-400 sm:self-center">
                Showing <span className="font-medium">{filteredProducts.length}</span>{" "}
                of <span className="font-medium">{products.length}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setServiceQuery("");
                  setCountry("");
                  setPriceSort("none");
                }}
              >
                Reset filters
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Service
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Informations
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Country
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Price
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Actions
                  </TableCell>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="px-5 py-6 text-center text-theme-sm text-gray-600 dark:text-gray-400"
                      colSpan={5}
                    >
                      {products.length === 0
                        ? "No products available. Admin can add products from the Admin panel."
                        : "No products match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-5 py-4 text-start text-theme-sm font-medium text-gray-800 dark:text-white/90">
                        {p.service}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                        {p.informations || "—"}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                        {p.country}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                        ${p.priceUsd.toFixed(2)}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-end">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddToCart(p)}
                          >
                            Add to cart
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleBuyNow(p)}
                          >
                            Buy now
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

      <Modal
        isOpen={paymentModal.open}
        onClose={closePaymentModal}
        className="max-w-[500px] m-4 p-6"
      >
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Choose Payment Method
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {paymentModal.product && (
            <>
              Pay ${paymentModal.product.priceUsd.toFixed(2)} for{" "}
              {paymentModal.product.service}
            </>
          )}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button
            variant="primary"
            onClick={handlePaymentWithCredits}
            className="w-full"
          >
            Pay with Credits
          </Button>
          <Button
            variant="outline"
            onClick={handlePaymentWithCoinbase}
            className="w-full"
          >
            Pay with Coinbase
          </Button>
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={closePaymentModal}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
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
import { useCart, type CartAccountItem } from "../../context/CartContext";

type Product = {
  id?: string;
  productName: string;
  priceUsd: number;
  country: string;
  numberOfShipments: number;
};

export default function AccountsStore() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [nameQuery, setNameQuery] = useState("");
  const [country, setCountry] = useState("");
  const [shipmentsMin, setShipmentsMin] = useState("");
  const [shipmentsMax, setShipmentsMax] = useState("");
  const [priceSort, setPriceSort] = useState<"none" | "asc" | "desc">("none");

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
        if (Array.isArray(list) && list.length > 0) {
          setProducts(list);
          return;
        }
        // Friendly fallback if admin hasn't added products yet.
        setProducts([
          {
            productName: "FedEx Account (Starter)",
            priceUsd: 49,
            country: "United States",
            numberOfShipments: 25,
          },
          {
            productName: "UPS Account (Business)",
            priceUsd: 99,
            country: "Canada",
            numberOfShipments: 60,
          },
          {
            productName: "DHL Account (International)",
            priceUsd: 149,
            country: "Germany",
            numberOfShipments: 120,
          },
        ]);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load products.");
        // Still show examples.
        setProducts([
          {
            productName: "FedEx Account (Starter)",
            priceUsd: 49,
            country: "United States",
            numberOfShipments: 25,
          },
          {
            productName: "UPS Account (Business)",
            priceUsd: 99,
            country: "Canada",
            numberOfShipments: 60,
          },
          {
            productName: "DHL Account (International)",
            priceUsd: 149,
            country: "Germany",
            numberOfShipments: 120,
          },
        ]);
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
    const q = nameQuery.trim().toLowerCase();
    const min = shipmentsMin.trim() ? Number(shipmentsMin) : null;
    const max = shipmentsMax.trim() ? Number(shipmentsMax) : null;

    let list = products.slice();

    if (q) {
      list = list.filter((p) => p.productName.toLowerCase().includes(q));
    }
    if (country) {
      list = list.filter((p) => p.country === country);
    }
    if (min !== null && Number.isFinite(min)) {
      list = list.filter((p) => p.numberOfShipments >= min);
    }
    if (max !== null && Number.isFinite(max)) {
      list = list.filter((p) => p.numberOfShipments <= max);
    }

    if (priceSort === "asc") {
      list.sort((a, b) => a.priceUsd - b.priceUsd);
    } else if (priceSort === "desc") {
      list.sort((a, b) => b.priceUsd - a.priceUsd);
    }

    return list;
  }, [products, nameQuery, country, shipmentsMin, shipmentsMax, priceSort]);

  const handleBuy = (p: Product) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const item: CartAccountItem = {
      id,
      createdAt: new Date().toISOString(),
      kind: "account",
      productName: p.productName,
      priceUsd: p.priceUsd,
      country: p.country,
      numberOfShipments: p.numberOfShipments,
    };

    addItem(item);
    setMessage(`Added "${p.productName}" to cart.`);
    navigate("/cart");
  };

  return (
    <div>
      <PageMeta
        title="Accounts Store | Labelz"
        description="Browse shipping accounts for purchase."
      />
      <PageBreadcrumb pageTitle="Accounts Store" />

      <ComponentCard
        title="Accounts for Sale"
        desc='Products for sale. Columns: "Product Name";"Price";"Country";"Number of Shipments";"Buy Action"'
      >
        {loadError ? (
          <div className="mb-4 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
            {loadError}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-700 dark:text-success-400">
            {message}
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <Label htmlFor="productNameFilter">Product Name</Label>
              <Input
                id="productNameFilter"
                placeholder="Search by name..."
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
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
              <Label htmlFor="shipmentsMin">Number of Shipments (min)</Label>
              <Input
                id="shipmentsMin"
                type="number"
                min="0"
                step={1}
                placeholder="0"
                value={shipmentsMin}
                onChange={(e) => setShipmentsMin(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="shipmentsMax">Number of Shipments (max)</Label>
              <Input
                id="shipmentsMax"
                type="number"
                min="0"
                step={1}
                placeholder="999"
                value={shipmentsMax}
                onChange={(e) => setShipmentsMax(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-xs">
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

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <div className="text-sm text-gray-600 dark:text-gray-400 sm:self-center">
                Showing <span className="font-medium">{filteredProducts.length}</span>{" "}
                of <span className="font-medium">{products.length}</span>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setNameQuery("");
                  setCountry("");
                  setShipmentsMin("");
                  setShipmentsMax("");
                  setPriceSort("none");
                }}
              >
                Reset filters
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  <TableCell
                    isHeader
                    className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Product Name
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Price
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
                    Number of Shipments
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Buy Action
                  </TableCell>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="px-5 py-6 text-center text-theme-sm text-gray-600 dark:text-gray-400"
                    >
                      No products match your filters.
                    </TableCell>
                    <TableCell className="px-5 py-6">{" "}</TableCell>
                    <TableCell className="px-5 py-6">{" "}</TableCell>
                    <TableCell className="px-5 py-6">{" "}</TableCell>
                    <TableCell className="px-5 py-6">{" "}</TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((p) => (
                    <TableRow key={p.productName}>
                      <TableCell className="px-5 py-4 text-start text-theme-sm font-medium text-gray-800 dark:text-white/90">
                        {p.productName}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                        ${p.priceUsd.toFixed(2)}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                        {p.country}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                        {p.numberOfShipments}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-end">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleBuy(p)}
                        >
                          Buy
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
  );
}


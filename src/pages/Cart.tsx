import { useEffect, useMemo, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import ComponentCard from "../components/common/ComponentCard";
import Button from "../components/ui/button/Button";
import { useCart } from "../context/CartContext";
import { Link } from "react-router";

export default function Cart() {
  const { items, removeItem, clear, count } = useCart();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const token = useMemo(() => localStorage.getItem("auth.token") || "", []);
  const isAuthed = Boolean(token);

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [creditMessage, setCreditMessage] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState<string>("");

  const refreshBalance = async () => {
    if (!isAuthed) return;
    setCreditError(null);
    try {
      const r = await fetch("/api/wallet/balance", {
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
            : `Failed to load balance (HTTP ${r.status}).`;
        throw new Error(msg);
      }
      const balance =
        data && typeof data === "object"
          ? (data as { balance?: unknown }).balance
          : null;
      if (typeof balance !== "number") {
        throw new Error("Invalid balance response.");
      }
      setCreditBalance(balance);
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : "Failed to load balance.");
    }
  };

  useEffect(() => {
    if (isAuthed) void refreshBalance();
    // token is intentionally stable from memo on initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const handleTopup = async () => {
    setCreditMessage(null);
    setCreditError(null);
    const amountUsd = Number(topupAmount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setCreditError("Enter a valid top-up amount.");
      return;
    }
    if (!isAuthed) {
      setCreditError("Please sign in to replenish credits.");
      return;
    }

    setIsCheckingOut(true);
    try {
      const r = await fetch("/api/wallet/topup/create-charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amountUsd }),
      });

      const raw = await r.text();
      let data: unknown = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!r.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String((data as { error?: unknown }).error)
            : raw || `Top-up failed (HTTP ${r.status}).`;
        throw new Error(message);
      }

      const checkoutUrl = (data as { checkoutUrl?: unknown }).checkoutUrl;
      if (typeof checkoutUrl !== "string" || !checkoutUrl) {
        throw new Error("No checkout URL returned from server.");
      }
      window.location.assign(checkoutUrl);
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : "Top-up failed.");
      setIsCheckingOut(false);
    }
  };

  const handlePayWithCredits = async () => {
    setCreditMessage(null);
    setCreditError(null);
    if (!isAuthed) {
      setCreditError("Please sign in to pay with credits.");
      return;
    }
    if (items.length === 0) return;

    setIsCheckingOut(true);
    try {
      const r = await fetch("/api/wallet/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
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
            : `Payment failed (HTTP ${r.status}).`;
        throw new Error(msg);
      }

      const balance =
        data && typeof data === "object"
          ? (data as { balance?: unknown }).balance
          : null;
      if (typeof balance === "number") setCreditBalance(balance);

      clear();
      setCreditMessage("Paid with credits successfully.");
      setIsCheckingOut(false);
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : "Payment failed.");
      setIsCheckingOut(false);
    }
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setCheckoutError(null);
    setIsCheckingOut(true);
    try {
      const r = await fetch("/api/coinbase/create-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      // Be resilient: the dev proxy (or server) can return empty/non-JSON bodies on errors.
      const raw = await r.text();
      let data: unknown = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!r.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String((data as { error?: unknown }).error)
            : raw || `Checkout failed (HTTP ${r.status}).`;
        throw new Error(message);
      }

      if (!data || typeof data !== "object") {
        throw new Error("Checkout failed (invalid server response).");
      }

      const checkoutUrl = (data as { checkoutUrl?: unknown }).checkoutUrl;
      if (typeof checkoutUrl !== "string" || !checkoutUrl) {
        throw new Error("No checkout URL returned from server.");
      }
      window.location.assign(checkoutUrl);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed.");
      setIsCheckingOut(false);
    }
  };

  return (
    <div>
      <PageMeta title="Cart | Label Land" description="Your purchased labels cart." />
      <PageBreadcrumb pageTitle="Cart" />

      <ComponentCard
        title={`Cart Items (${count})`}
        desc="Items you added to cart. You can pay via Coinbase or with your credits balance."
      >
        {items.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Your cart is empty.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                    Credits
                  </div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Balance:{" "}
                    <span className="font-medium">
                      {isAuthed
                        ? creditBalance === null
                          ? "—"
                          : `$${creditBalance.toFixed(2)}`
                        : "Sign in to use credits"}
                    </span>
                  </div>
                  {!isAuthed ? (
                    <div className="mt-1 text-sm">
                      <Link
                        to="/signin"
                        className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                      >
                        Sign in
                      </Link>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={refreshBalance}
                      className="mt-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      disabled={isCheckingOut}
                    >
                      Refresh balance
                    </button>
                  )}
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
                  <div className="sm:w-48">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                      Replenish (USD)
                    </label>
                    <input
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="25.00"
                      className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                      disabled={isCheckingOut}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleTopup}
                    disabled={isCheckingOut}
                  >
                    Top up via Coinbase
                  </Button>
                </div>
              </div>

              {creditError ? (
                <div className="mt-3 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
                  {creditError}
                </div>
              ) : null}
              {creditMessage ? (
                <div className="mt-3 rounded-lg border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-700 dark:text-success-400">
                  {creditMessage}
                </div>
              ) : null}
            </div>

            {checkoutError ? (
              <div className="rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
                {checkoutError}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={handlePayWithCredits}
                disabled={isCheckingOut || items.length === 0 || !isAuthed}
              >
                Pay with Credits
              </Button>
              <Button
                variant="primary"
                onClick={handleCheckout}
                disabled={isCheckingOut || items.length === 0}
              >
                {isCheckingOut ? "Redirecting..." : "Purchase with Coinbase"}
              </Button>
              <Button
                variant="outline"
                onClick={clear}
                disabled={isCheckingOut}
              >
                Clear cart
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      {item.kind === "label" ? (
                        <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {item.carrier.toUpperCase()} • {item.service} •{" "}
                          {item.weightLbs} lbs
                        </div>
                      ) : (
                        <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {item.productName} • ${item.priceUsd.toFixed(2)}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Added: {new Date(item.createdAt).toLocaleString()}
                      </div>
                      {item.kind === "label" ? (
                        <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 dark:text-gray-300 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              From
                            </div>
                            <div>{item.from.name}</div>
                            <div>{item.from.address1}</div>
                             <div>
                                {item.from.city}, {item.from.state} {item.from.zip}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {item.from.country}
                              </div>
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Dims: {item.dimensionsIn.length}×{item.dimensionsIn.width}×
                                {item.dimensionsIn.height} in
                              </div>
                              {item.declarationItem ? (
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Item: {item.declarationItem}
                                </div>
                              ) : null}
                              {typeof item.declarationQuantity === "number" &&
                              item.declarationQuantity > 0 ? (
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Qty: {item.declarationQuantity}
                                </div>
                              ) : null}
                              {typeof item.declaredValueUsd === "number" &&
                              item.declaredValueUsd > 0 ? (
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Value: ${item.declaredValueUsd.toFixed(2)}
                                </div>
                              ) : null}
                              {item.hsCode ? (
                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  HS: {item.hsCode}
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                To
                              </div>
                              <div>{item.to.name}</div>
                              <div>{item.to.address1}</div>
                              <div>
                                {item.to.city}, {item.to.state} {item.to.zip}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {item.to.country}
                              </div>
                            </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Country
                          </div>
                          <div>{item.country}</div>
                          <div className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                            Number of Shipments
                          </div>
                          <div>{item.numberOfShipments}</div>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => removeItem(item.id)}
                        disabled={isCheckingOut}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ComponentCard>
    </div>
  );
}


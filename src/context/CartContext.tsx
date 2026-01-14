import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartAddress = {
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type CartLabelItem = {
  id: string;
  createdAt: string; // ISO
  kind: "label";
  carrier: string;
  service: string;
  declarationItem?: string;
  declarationQuantity?: number;
  declaredValueUsd?: number;
  hsCode?: string;
  weightLbs: number;
  dimensionsIn: {
    length: number;
    width: number;
    height: number;
  };
  from: CartAddress;
  to: CartAddress;
};

export type CartAccountItem = {
  id: string;
  createdAt: string; // ISO
  kind: "account";
  productName: string;
  priceUsd: number;
  country: string;
  numberOfShipments: number;
};

export type CartItem = CartLabelItem | CartAccountItem;

type CartContextType = {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  count: number;
};

const STORAGE_KEY = "labelz.cart.v1";

const CartContext = createContext<CartContextType | undefined>(undefined);

const normalizeItem = (x: unknown): CartItem | null => {
  if (!x || typeof x !== "object") return null;
  const anyX = x as Record<string, unknown>;

  // New format: explicit kind.
  if (anyX.kind === "label") {
    const base = anyX as unknown as Partial<CartLabelItem>;
    return {
      ...(base as CartLabelItem),
      kind: "label",
      declarationItem:
        typeof base.declarationItem === "string" ? base.declarationItem : "",
      declarationQuantity:
        typeof base.declarationQuantity === "number" &&
        Number.isFinite(base.declarationQuantity)
          ? base.declarationQuantity
          : 0,
      declaredValueUsd:
        typeof base.declaredValueUsd === "number" &&
        Number.isFinite(base.declaredValueUsd)
          ? base.declaredValueUsd
          : 0,
      hsCode: typeof base.hsCode === "string" ? base.hsCode : "",
      dimensionsIn:
        base.dimensionsIn ?? ({ length: 0, width: 0, height: 0 } as CartLabelItem["dimensionsIn"]),
      from: {
        ...(base.from as CartAddress),
        country: (base.from as CartAddress | undefined)?.country ?? "US",
      },
      to: {
        ...(base.to as CartAddress),
        country: (base.to as CartAddress | undefined)?.country ?? "US",
      },
    } as CartLabelItem;
  }
  if (anyX.kind === "account") return anyX as unknown as CartAccountItem;

  // Backward-compat: older label items (no kind).
  if (anyX.from && anyX.to) {
    const base = anyX as unknown as Partial<CartLabelItem>;
    return {
      ...(base as CartLabelItem),
      kind: "label",
      declarationItem:
        typeof base.declarationItem === "string" ? base.declarationItem : "",
      declarationQuantity:
        typeof base.declarationQuantity === "number" &&
        Number.isFinite(base.declarationQuantity)
          ? base.declarationQuantity
          : 0,
      declaredValueUsd:
        typeof base.declaredValueUsd === "number" &&
        Number.isFinite(base.declaredValueUsd)
          ? base.declaredValueUsd
          : 0,
      hsCode: typeof base.hsCode === "string" ? base.hsCode : "",
      dimensionsIn:
        base.dimensionsIn ?? ({ length: 0, width: 0, height: 0 } as CartLabelItem["dimensionsIn"]),
      from: {
        ...(base.from as CartAddress),
        country: (base.from as CartAddress | undefined)?.country ?? "US",
      },
      to: {
        ...(base.to as CartAddress),
        country: (base.to as CartAddress | undefined)?.country ?? "US",
      },
    } as CartLabelItem;
  }

  return null;
};

const safeParseItems = (raw: string | null): CartItem[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem).filter(Boolean) as CartItem[];
  } catch {
    return [];
  }
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [items, setItems] = useState<CartItem[]>(() =>
    safeParseItems(localStorage.getItem(STORAGE_KEY)),
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextType>(() => {
    return {
      items,
      addItem: (item) => setItems((prev) => [item, ...prev]),
      removeItem: (id) => setItems((prev) => prev.filter((x) => x.id !== id)),
      clear: () => setItems([]),
      count: items.length,
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
};


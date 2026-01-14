import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Select from "../../components/form/Select";
import Button from "../../components/ui/button/Button";
import { useCart } from "../../context/CartContext";
import { COUNTRY_OPTIONS } from "../../constants/countries";

type Carrier = "fedex" | "ups" | "usps" | "dhl";

export default function CreateLabel() {
  const navigate = useNavigate();
  const { addItem } = useCart();

  const suggestHsCode = (raw: string): string | null => {
    const s = raw.trim().toLowerCase();
    if (!s) return null;

    // Simple keyword-based best-effort HS suggestions.
    // NOTE: HS codes can vary by material and country rules—user should verify.
    const matchAny = (words: string[]) => words.some((w) => s.includes(w));

    if (matchAny(["t-shirt", "tshirt", "tee", "cotton shirt"])) return "6109.10";
    if (matchAny(["shoe", "shoes", "sneaker", "boot"])) return "6403.99";
    if (matchAny(["phone case", "iphone case", "samsung case", "case"])) return "3926.90";
    if (matchAny(["laptop", "notebook", "macbook"])) return "8471.30";
    if (matchAny(["headphone", "headphones", "earphone", "earphones", "earbuds"])) return "8518.30";
    if (matchAny(["cosmetic", "cosmetics", "makeup", "lipstick", "foundation"])) return "3304.99";
    if (matchAny(["supplement", "supplements", "vitamin", "protein powder"])) return "2106.90";
    if (matchAny(["toy", "toys"])) return "9503.00";
    if (matchAny(["watch", "wristwatch"])) return "9102.11";
    if (matchAny(["battery", "batteries", "lithium"])) return "8507.60";

    return null;
  };

  const unitOptions = useMemo(
    () => [
      { value: "imperial", label: "Imperial (lb, in)" },
      { value: "metric", label: "Metric (kg, cm)" },
    ],
    [],
  );

  const carrierOptions = useMemo(
    () => [
      { value: "fedex", label: "FedEx" },
      { value: "ups", label: "UPS" },
      { value: "usps", label: "USPS" },
      { value: "dhl", label: "DHL" },
    ],
    [],
  );

  const countryOptions = COUNTRY_OPTIONS;

  const [carrier, setCarrier] = useState<Carrier | "">("fedex");
  const serviceOptions = useMemo(() => {
    if (carrier === "fedex") {
      return [
        { value: "International Priority Express", label: "Priority Express" },
        { value: "International Priority", label: "Priority" },
        { value: "International Economy", label: "Economy" },
      ];
    }
    if (carrier === "ups") {
      return [
        { value: "SAVER", label: "Saver" },
      ];
    }
    if (carrier === "usps") {
      return [
        { value: "GROUND_ADVANTAGE", label: "Ground Advantage" },
        { value: "PRIORITY", label: "Priority Mail" },
        { value: "EXPRESS", label: "Priority Mail Express" },
      ];
    }
    if (carrier === "dhl") { 
      return [
        { value: "DHL_EXPRESS_WORLD_WIDE", label: "Express Worldwide" },
        { value: "DHL_EXPRESS_WORLD_WIDE_PLUS", label: "Express Worldwide Plus" },
        { value: "DHL_EXPRESS_WORLD_WIDE_PREMIUM", label: "Express Worldwide Premium" },
      ];
    }
    return [];
  }, [carrier]);

  const [unitSystem, setUnitSystem] = useState<"imperial" | "metric">("imperial");
  const [service, setService] = useState("");
  const [declarationItem, setDeclarationItem] = useState("");
  const [declarationQuantity, setDeclarationQuantity] = useState<string>("1");
  const [declaredValueUsd, setDeclaredValueUsd] = useState<string>("");
  const [hsCode, setHsCode] = useState("");
  const [hsCodeSource, setHsCodeSource] = useState<"auto" | "manual">("auto");
  const [hsHint, setHsHint] = useState<string>("");
  const [weightLbs, setWeightLbs] = useState<string>("");
  const [lengthIn, setLengthIn] = useState<string>("");
  const [widthIn, setWidthIn] = useState<string>("");
  const [heightIn, setHeightIn] = useState<string>("");

  const [fromName, setFromName] = useState("");
  const [fromAddress1, setFromAddress1] = useState("");
  const [fromCity, setFromCity] = useState("");
  const [fromState, setFromState] = useState("");
  const [fromZip, setFromZip] = useState("");
  const [fromCountry, setFromCountry] = useState("US");

  const [toName, setToName] = useState("");
  const [toAddress1, setToAddress1] = useState("");
  const [toCity, setToCity] = useState("");
  const [toState, setToState] = useState("");
  const [toZip, setToZip] = useState("");
  const [toCountry, setToCountry] = useState("US");

  const [fromZipStatus, setFromZipStatus] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error"; message: string }
  >({ state: "idle" });
  const [toZipStatus, setToZipStatus] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error"; message: string }
  >({ state: "idle" });

  const fromZipAbortRef = useRef<AbortController | null>(null);
  const toZipAbortRef = useRef<AbortController | null>(null);

  const [purchaseResult, setPurchaseResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const isUSZip = (zip: string) => /^\d{5}$/.test(zip.trim());

  const lookupUSZip = async (zip: string, signal: AbortSignal) => {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal });
    if (!res.ok) {
      throw new Error("ZIP not found");
    }
    const data: unknown = await res.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("places" in data) ||
      !Array.isArray((data as { places?: unknown }).places) ||
      (data as { places: unknown[] }).places.length === 0
    ) {
      throw new Error("Invalid ZIP response");
    }
    const place = (data as { places: unknown[] }).places[0];
    if (
      !place ||
      typeof place !== "object" ||
      !("place name" in place) ||
      !("state abbreviation" in place)
    ) {
      throw new Error("Invalid ZIP response");
    }
    const city = String((place as { "place name": unknown })["place name"]);
    const state = String(
      (place as { "state abbreviation": unknown })["state abbreviation"],
    );
    return { city, state };
  };

  useEffect(() => {
    const zip = fromZip.trim();
    if (!zip || fromCountry !== "US") {
      setFromZipStatus({ state: "idle" });
      return;
    }
    if (!isUSZip(zip)) {
      setFromZipStatus({ state: "idle" });
      return;
    }

    // Avoid overwriting if user already set city/state.
    if (fromCity.trim() && fromState.trim()) return;

    fromZipAbortRef.current?.abort();
    const controller = new AbortController();
    fromZipAbortRef.current = controller;

    setFromZipStatus({ state: "loading" });
    lookupUSZip(zip, controller.signal)
      .then(({ city, state }) => {
        if (!fromCity.trim()) setFromCity(city);
        if (!fromState.trim()) setFromState(state);
        setFromZipStatus({ state: "idle" });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFromZipStatus({
          state: "error",
          message:
            err instanceof Error ? err.message : "Failed to look up that ZIP",
        });
      });

    return () => controller.abort();
  }, [fromZip, fromCity, fromState]);

  useEffect(() => {
    const zip = toZip.trim();
    if (!zip || toCountry !== "US") {
      setToZipStatus({ state: "idle" });
      return;
    }
    if (!isUSZip(zip)) {
      setToZipStatus({ state: "idle" });
      return;
    }

    // Avoid overwriting if user already set city/state.
    if (toCity.trim() && toState.trim()) return;

    toZipAbortRef.current?.abort();
    const controller = new AbortController();
    toZipAbortRef.current = controller;

    setToZipStatus({ state: "loading" });
    lookupUSZip(zip, controller.signal)
      .then(({ city, state }) => {
        if (!toCity.trim()) setToCity(city);
        if (!toState.trim()) setToState(state);
        setToZipStatus({ state: "idle" });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setToZipStatus({
          state: "error",
          message:
            err instanceof Error ? err.message : "Failed to look up that ZIP",
        });
      });

    return () => controller.abort();
  }, [toZip, toCity, toState]);

  useEffect(() => {
    const suggestion = suggestHsCode(declarationItem);
    if (suggestion) {
      setHsHint(`Suggested HS: ${suggestion}`);
      // Only auto-fill if user hasn't manually overridden, or HS is empty.
      if (hsCodeSource === "auto" || !hsCode.trim()) {
        setHsCode(suggestion);
        setHsCodeSource("auto");
      }
    } else {
      setHsHint(declarationItem.trim() ? "No HS suggestion found." : "");
    }
    // We intentionally include hsCode/hsCodeSource so behavior is stable for manual override.
  }, [declarationItem, hsCode, hsCodeSource]);

  const isValid = useMemo(() => {
    const weightNum = Number(weightLbs);
    const lengthNum = Number(lengthIn);
    const widthNum = Number(widthIn);
    const heightNum = Number(heightIn);
    const qtyNum = Number(declarationQuantity);
    const declaredValueNum = Number(declaredValueUsd);
    return Boolean(
      carrier &&
        service &&
        declarationItem.trim() &&
        Number.isFinite(qtyNum) &&
        qtyNum > 0 &&
        Number.isFinite(declaredValueNum) &&
        declaredValueNum > 0 &&
        Number.isFinite(weightNum) &&
        weightNum > 0 &&
        Number.isFinite(lengthNum) &&
        lengthNum > 0 &&
        Number.isFinite(widthNum) &&
        widthNum > 0 &&
        Number.isFinite(heightNum) &&
        heightNum > 0 &&
        fromName.trim() &&
        fromAddress1.trim() &&
        fromCity.trim() &&
        fromState.trim() &&
        fromZip.trim() &&
        fromCountry.trim() &&
        toName.trim() &&
        toAddress1.trim() &&
        toCity.trim() &&
        toState.trim() &&
        toZip.trim() &&
        toCountry.trim(),
    );
  }, [
    carrier,
    service,
    unitSystem,
    declarationItem,
    declarationQuantity,
    declaredValueUsd,
    hsCode,
    weightLbs,
    lengthIn,
    widthIn,
    heightIn,
    fromName,
    fromAddress1,
    fromCity,
    fromState,
    fromZip,
    fromCountry,
    toName,
    toAddress1,
    toCity,
    toState,
    toZip,
    toCountry,
  ]);

  const handlePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setPurchaseResult({
        ok: false,
        message: "Please complete all required fields before purchasing.",
      });
      return;
    }

    const weightInput = Number(weightLbs);
    const lengthInput = Number(lengthIn);
    const widthInput = Number(widthIn);
    const heightInput = Number(heightIn);
    const qtyInput = Number(declarationQuantity);
    const declaredValueInput = Number(declaredValueUsd);

    // Normalize to canonical units for storage (lbs + inches).
    const normalizedWeightLbs =
      unitSystem === "metric" ? weightInput / 0.45359237 : weightInput;
    const normalizedDimsIn =
      unitSystem === "metric"
        ? {
            length: lengthInput / 2.54,
            width: widthInput / 2.54,
            height: heightInput / 2.54,
          }
        : { length: lengthInput, width: widthInput, height: heightInput };

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    addItem({
      id,
      createdAt: new Date().toISOString(),
      kind: "label",
      carrier: carrier || "",
      service,
      declarationItem: declarationItem.trim(),
      declarationQuantity: Math.floor(qtyInput),
      declaredValueUsd: Number(declaredValueInput.toFixed(2)),
      hsCode: hsCode.trim(),
      weightLbs: Number(normalizedWeightLbs.toFixed(3)),
      dimensionsIn: {
        length: Number(normalizedDimsIn.length.toFixed(3)),
        width: Number(normalizedDimsIn.width.toFixed(3)),
        height: Number(normalizedDimsIn.height.toFixed(3)),
      },
      from: {
        name: fromName.trim(),
        address1: fromAddress1.trim(),
        city: fromCity.trim(),
        state: fromState.trim(),
        zip: fromZip.trim(),
        country: fromCountry,
      },
      to: {
        name: toName.trim(),
        address1: toAddress1.trim(),
        city: toCity.trim(),
        state: toState.trim(),
        zip: toZip.trim(),
        country: toCountry,
      },
    });

    navigate("/cart");
  };

  return (
    <div>
      <PageMeta
        title="Create Label | Labelz"
        description="Create a shipping label and purchase it."
      />
      <PageBreadcrumb pageTitle="Create Label" />

      <form onSubmit={handlePurchase} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ComponentCard
            title="Shipment"
            desc="Enter carrier/service and package weight."
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Units</Label>
                <Select
                  options={unitOptions}
                  defaultValue={unitSystem}
                  onChange={(v) => {
                    const next = v === "metric" ? "metric" : "imperial";
                    if (next === unitSystem) return;

                    const w = Number(weightLbs);
                    const l = Number(lengthIn);
                    const wi = Number(widthIn);
                    const h = Number(heightIn);

                    // Convert existing entered values for a smooth UX.
                    if (Number.isFinite(w) && w > 0) {
                      const nextW =
                        next === "metric" ? w * 0.45359237 : w / 0.45359237;
                      setWeightLbs(String(Number(nextW.toFixed(3))));
                    }
                    if (Number.isFinite(l) && l > 0) {
                      const nextL = next === "metric" ? l * 2.54 : l / 2.54;
                      setLengthIn(String(Number(nextL.toFixed(3))));
                    }
                    if (Number.isFinite(wi) && wi > 0) {
                      const nextWi = next === "metric" ? wi * 2.54 : wi / 2.54;
                      setWidthIn(String(Number(nextWi.toFixed(3))));
                    }
                    if (Number.isFinite(h) && h > 0) {
                      const nextH = next === "metric" ? h * 2.54 : h / 2.54;
                      setHeightIn(String(Number(nextH.toFixed(3))));
                    }

                    setUnitSystem(next);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div>
                <Label>Carrier</Label>
                <Select
                  options={carrierOptions}
                  defaultValue={carrier || ""}
                  onChange={(v) => {
                    setCarrier(v as Carrier);
                    setService("");
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div>
                <Label>Service</Label>
                <Select
                  options={serviceOptions}
                  placeholder={
                    carrier ? "Select a service" : "Select a carrier first"
                  }
                  defaultValue={service}
                  onChange={(v) => {
                    setService(v);
                    setPurchaseResult(null);
                  }}
                  className={!carrier ? "opacity-60" : ""}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="declarationItem">Declaration Item</Label>
                <Input
                  id="declarationItem"
                  placeholder="e.g. laptop, shoes, phone case..."
                  value={declarationItem}
                  onChange={(e) => {
                    setDeclarationItem(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="declarationQuantity">Quantity (units)</Label>
                <Input
                  id="declarationQuantity"
                  type="number"
                  min="1"
                  step={1}
                  placeholder="1"
                  value={declarationQuantity}
                  onChange={(e) => {
                    setDeclarationQuantity(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="declaredValueUsd">Declared Value (USD)</Label>
                <Input
                  id="declaredValueUsd"
                  type="number"
                  min="0"
                  step={0.01}
                  placeholder="10.00"
                  value={declaredValueUsd}
                  onChange={(e) => {
                    setDeclaredValueUsd(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="hsCode">HS Code (optional)</Label>
                <Input
                  id="hsCode"
                  placeholder="e.g. 8471.30"
                  value={hsCode}
                  onChange={(e) => {
                    setHsCode(e.target.value);
                    setHsCodeSource(e.target.value.trim() ? "manual" : "auto");
                    setPurchaseResult(null);
                  }}
                  hint={hsHint || "If you type a declaration item, we’ll try to suggest a HS code."}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="weightLbs">
                  Weight ({unitSystem === "metric" ? "kg" : "lbs"})
                </Label>
                <Input
                  id="weightLbs"
                  type="number"
                  min="0"
                  step={0.1}
                  placeholder={unitSystem === "metric" ? "0.5" : "1.2"}
                  value={weightLbs}
                  onChange={(e) => {
                    setWeightLbs(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>

              <div className="sm:col-span-2">
                <Label>
                  Dimensions ({unitSystem === "metric" ? "cm" : "in"})
                </Label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="lengthIn" className="text-xs">
                      Length
                    </Label>
                    <Input
                      id="lengthIn"
                      type="number"
                      min="0"
                      step={0.1}
                      placeholder={unitSystem === "metric" ? "30" : "12"}
                      value={lengthIn}
                      onChange={(e) => {
                        setLengthIn(e.target.value);
                        setPurchaseResult(null);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="widthIn" className="text-xs">
                      Width
                    </Label>
                    <Input
                      id="widthIn"
                      type="number"
                      min="0"
                      step={0.1}
                      placeholder={unitSystem === "metric" ? "20" : "8"}
                      value={widthIn}
                      onChange={(e) => {
                        setWidthIn(e.target.value);
                        setPurchaseResult(null);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="heightIn" className="text-xs">
                      Height
                    </Label>
                    <Input
                      id="heightIn"
                      type="number"
                      min="0"
                      step={0.1}
                      placeholder={unitSystem === "metric" ? "10" : "4"}
                      value={heightIn}
                      onChange={(e) => {
                        setHeightIn(e.target.value);
                        setPurchaseResult(null);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard
            title="Purchase"
            desc="Review and purchase your label."
          >
            {purchaseResult ? (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  purchaseResult.ok
                    ? "border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-400"
                    : "border-error-500/30 bg-error-500/10 text-error-700 dark:text-error-400"
                }`}
              >
                {purchaseResult.message}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                Fill in the shipment + address details, then click Purchase.
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={!isValid}
                className="w-full sm:w-auto"
              >
                Purchase Label
              </Button>
            </div>
          </ComponentCard>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ComponentCard title="From" desc="Sender address (required).">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Country</Label>
                <Select
                  options={countryOptions}
                  defaultValue={fromCountry}
                  onChange={(v) => {
                    setFromCountry(v);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="fromName">Name</Label>
                <Input
                  id="fromName"
                  placeholder="Sender name"
                  value={fromName}
                  onChange={(e) => {
                    setFromName(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="fromAddress1">Address</Label>
                <Input
                  id="fromAddress1"
                  placeholder="123 Main St"
                  value={fromAddress1}
                  onChange={(e) => {
                    setFromAddress1(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="fromCity">City</Label>
                <Input
                  id="fromCity"
                  placeholder="City"
                  value={fromCity}
                  onChange={(e) => {
                    setFromCity(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="fromState">State</Label>
                <Input
                  id="fromState"
                  placeholder="CA"
                  value={fromState}
                  onChange={(e) => {
                    setFromState(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="fromZip">ZIP</Label>
                <Input
                  id="fromZip"
                  placeholder="94105"
                  value={fromZip}
                  onChange={(e) => {
                    setFromZip(e.target.value);
                    setPurchaseResult(null);
                  }}
                  hint={
                    fromZipStatus.state === "loading"
                      ? "Looking up city/state from ZIP..."
                      : fromZipStatus.state === "error"
                      ? fromZipStatus.message
                      : fromCountry === "US" 
                        ? "Enter a 5-digit US ZIP to auto-fill city/state."
                        : "Enter postal code."
                  }
                  error={fromZipStatus.state === "error"}
                />
              </div>
            </div>
          </ComponentCard>

          <ComponentCard title="To" desc="Recipient address (required).">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Country</Label>
                <Select
                  options={countryOptions}
                  defaultValue={toCountry}
                  onChange={(v) => {
                    setToCountry(v);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="toName">Name</Label>
                <Input
                  id="toName"
                  placeholder="Recipient name"
                  value={toName}
                  onChange={(e) => {
                    setToName(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="toAddress1">Address</Label>
                <Input
                  id="toAddress1"
                  placeholder="456 Market St"
                  value={toAddress1}
                  onChange={(e) => {
                    setToAddress1(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="toCity">City</Label>
                <Input
                  id="toCity"
                  placeholder="City"
                  value={toCity}
                  onChange={(e) => {
                    setToCity(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="toState">State</Label>
                <Input
                  id="toState"
                  placeholder="NY"
                  value={toState}
                  onChange={(e) => {
                    setToState(e.target.value);
                    setPurchaseResult(null);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="toZip">ZIP</Label>
                <Input
                  id="toZip"
                  placeholder="10001"
                  value={toZip}
                  onChange={(e) => {
                    setToZip(e.target.value);
                    setPurchaseResult(null);
                  }}
                  hint={
                    toZipStatus.state === "loading"
                      ? "Looking up city/state from ZIP..."
                      : toZipStatus.state === "error"
                      ? toZipStatus.message
                      : toCountry === "US"
                        ? "Enter a 5-digit US ZIP to auto-fill city/state."
                        : "Enter postal code."
                  }
                  error={toZipStatus.state === "error"}
                />
              </div>
            </div>
          </ComponentCard>
        </div>
      </form>
    </div>
  );
}

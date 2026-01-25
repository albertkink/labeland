import { useEffect, useState } from "react";
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

type Service = {
  service: string;
  name: string;
  price: number;
};

type TemporaryNumber = {
  id: string;
  number: string;
  service: string;
  country: string;
  status: string;
  code?: string;
  createdAt: string;
};

export default function TemporaryNumber() {
  const [services, setServices] = useState<Service[]>([]);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [numbers, setNumbers] = useState<TemporaryNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Load available services and countries
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/sms-verification/services")
        .then(async (r) => {
          if (!r.ok) throw new Error("Failed to load services");
          const data = await r.json();
          return data.services || [];
        })
        .catch(() => []),
      fetch("/api/sms-verification/countries")
        .then(async (r) => {
          if (!r.ok) throw new Error("Failed to load countries");
          const data = await r.json();
          return data.countries || [];
        })
        .catch(() => []),
    ])
      .then(([servicesList, countriesList]) => {
        if (cancelled) return;
        setServices(servicesList);
        setCountries(countriesList);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load data");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load user's temporary numbers
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sms-verification/temporary-numbers")
      .then(async (r) => {
        if (!r.ok) return [];
        const data = await r.json();
        return data.numbers || [];
      })
      .then((list) => {
        if (cancelled) return;
        setNumbers(list);
      })
      .catch(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGetNumber = async () => {
    if (!selectedCountry || !selectedService) {
      setError("Please select both country and service");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/sms-verification/get-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: selectedCountry,
          service: selectedService,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to get number");
      }

      setMessage("Number obtained successfully!");
      // Refresh numbers list
      const numbersResponse = await fetch("/api/sms-verification/temporary-numbers");
      if (numbersResponse.ok) {
        const numbersData = await numbersResponse.json();
        setNumbers(numbersData.numbers || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get number");
    } finally {
      setLoading(false);
    }
  };

  const handleGetCode = async (numberId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sms-verification/get-code/${numberId}`, {
        method: "POST",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to get code");
      }

      // Update the number in the list
      setNumbers((prev) =>
        prev.map((n) =>
          n.id === numberId ? { ...n, code: data.code, status: "completed" } : n
        )
      );
      setMessage("Code received successfully!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageMeta
        title="Temporary Number | SMS Verification | Labelz"
        description="Get temporary phone numbers for SMS verification."
      />
      <PageBreadcrumb pageTitle="Temporary Number" />

      <div className="space-y-6">
        <ComponentCard
          title="What is Temporary Number?"
          desc="Temporary Number service allows you to receive verification SMS codes from various online services without using your personal phone number. This is useful for account verification, testing, and maintaining privacy."
        >
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Our Temporary Number service provides you with disposable phone numbers that can receive SMS verification codes from popular websites and services. Simply select a country and service, get a number, and receive your verification code. This service is powered by SMSPool.net and supports hundreds of services including social media platforms, messaging apps, and online marketplaces.
            </p>
          </div>
        </ComponentCard>

        <ComponentCard
          title="Get Temporary Number"
          desc="Select a country and service to get a temporary phone number for SMS verification."
        >
          {error && (
            <div className="mb-4 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-lg border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-700 dark:text-success-400">
              {message}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="country">Country</Label>
                <select
                  id="country"
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                >
                  <option value="">Select Country</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="service">Service</Label>
                <select
                  id="service"
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                >
                  <option value="">Select Service</option>
                  {services.map((s) => (
                    <option key={s.service} value={s.service}>
                      {s.name} (${s.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <Button
                onClick={handleGetNumber}
                disabled={loading || !selectedCountry || !selectedService}
                variant="primary"
              >
                {loading ? "Getting Number..." : "Get Number"}
              </Button>
            </div>
          </div>
        </ComponentCard>

        <ComponentCard
          title="My Temporary Numbers"
          desc="List of temporary numbers you've obtained. Click 'Get Code' to retrieve the verification SMS."
        >
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      Number
                    </TableCell>
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
                      Country
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      Status
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      Code
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      Action
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {numbers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="px-5 py-6 text-center text-theme-sm text-gray-600 dark:text-gray-400"
                      >
                        No temporary numbers yet. Get one above to start.
                      </TableCell>
                    </TableRow>
                  ) : (
                    numbers.map((num) => (
                      <TableRow key={num.id}>
                        <TableCell className="px-5 py-4 text-start text-theme-sm font-medium text-gray-800 dark:text-white/90">
                          {num.number}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                          {num.service}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                          {num.country}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              num.status === "completed"
                                ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400"
                                : "bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-400"
                            }`}
                          >
                            {num.status}
                          </span>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-start text-theme-sm font-mono font-medium text-gray-800 dark:text-white/90">
                          {num.code || "—"}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-end">
                          {num.status !== "completed" && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleGetCode(num.id)}
                              disabled={loading}
                            >
                              Get Code
                            </Button>
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
      </div>
    </div>
  );
}

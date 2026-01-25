import { useEffect, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import Button from "../../components/ui/button/Button";
import Label from "../../components/form/Label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

type Country = {
  code: string;
  name: string;
  price: number;
  available: boolean;
};

type Rental = {
  id: string;
  number: string;
  country: string;
  service: string;
  expiresAt: string;
  status: string;
};

export default function NumberRental() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Load available countries for rental
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/sms-verification/rental-countries")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load countries");
        const data = await r.json();
        return data.countries || [];
      })
      .then((list) => {
        if (cancelled) return;
        setCountries(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load countries");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load user's rentals
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sms-verification/rentals")
      .then(async (r) => {
        if (!r.ok) return [];
        const data = await r.json();
        return data.rentals || [];
      })
      .then((list) => {
        if (cancelled) return;
        setRentals(list);
      })
      .catch(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRentNumber = async () => {
    if (!selectedCountry) {
      setError("Please select a country");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/sms-verification/rent-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: selectedCountry,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to rent number");
      }

      setMessage("Number rented successfully!");
      // Refresh rentals list
      const rentalsResponse = await fetch("/api/sms-verification/rentals");
      if (rentalsResponse.ok) {
        const rentalsData = await rentalsResponse.json();
        setRentals(rentalsData.rentals || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rent number");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageMeta
        title="Number Rental | SMS Verification | Labelz"
        description="Rent phone numbers for SMS verification by country."
      />
      <PageBreadcrumb pageTitle="Number Rental" />

      <div className="space-y-6">
        <ComponentCard
          title="What is Number Rental?"
          desc="Number Rental allows you to rent a phone number for an extended period, giving you more time to receive multiple verification codes and use the number for various services. Perfect for long-term projects or when you need a dedicated number."
        >
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Our Number Rental service provides you with dedicated phone numbers that you can rent for a specified duration. Unlike temporary numbers, rented numbers remain active for longer periods, allowing you to receive multiple SMS codes and use them across different services. This is ideal for businesses, developers, or anyone who needs a reliable number for ongoing verification needs. Select a country below to see available rental options and pricing.
            </p>
          </div>
        </ComponentCard>

        <ComponentCard
          title="Rent a Number by Country"
          desc="Select a country to rent a phone number for SMS verification."
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
                <Label htmlFor="rentalCountry">Country</Label>
                <select
                  id="rentalCountry"
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                >
                  <option value="">Select Country</option>
                  {countries
                    .filter((c) => c.available)
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} - ${c.price.toFixed(2)}/day
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <Button
                onClick={handleRentNumber}
                disabled={loading || !selectedCountry}
                variant="primary"
              >
                {loading ? "Renting Number..." : "Rent Number"}
              </Button>
            </div>
          </div>
        </ComponentCard>

        <ComponentCard
          title="My Rented Numbers"
          desc="List of phone numbers you've rented. These numbers remain active for the rental period."
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
                      Country
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
                      Expires At
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      Status
                    </TableCell>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {rentals.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="px-5 py-6 text-center text-theme-sm text-gray-600 dark:text-gray-400"
                      >
                        No rented numbers yet. Rent one above to start.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rentals.map((rental) => (
                      <TableRow key={rental.id}>
                        <TableCell className="px-5 py-4 text-start text-theme-sm font-medium text-gray-800 dark:text-white/90">
                          {rental.number}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                          {rental.country}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                          {rental.service || "All Services"}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                          {new Date(rental.expiresAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-start text-theme-sm text-gray-600 dark:text-gray-400">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              rental.status === "active"
                                ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                            }`}
                          >
                            {rental.status}
                          </span>
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

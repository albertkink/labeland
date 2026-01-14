import React from "react";
import GridShape from "../../components/common/GridShape";
import { Link } from "react-router";
import ThemeTogglerTwo from "../../components/common/ThemeTogglerTwo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <div className="relative flex flex-col justify-center w-full h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
        {children}
        <div className="items-center hidden w-full h-full lg:w-1/2 lg:grid">
          <div className="relative flex items-center justify-center h-full overflow-hidden z-1 bg-gradient-to-br from-brand-950 via-slate-950 to-indigo-950 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
            {/* <!-- ===== Common Grid Shape Start ===== --> */}
            <GridShape />
            <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="flex flex-col items-center max-w-sm px-8">
              <Link to="/signin" className="block mb-5 pointer-events-auto">
                <img
                  width={231}
                  height={48}
                  src="/images/logo/auth-logo.svg"
                  alt="Label.land"
                />
              </Link>
              <h2 className="text-center text-white text-xl font-semibold">
                Shipping labels in seconds
              </h2>
              <p className="mt-2 text-center text-white/70 text-sm leading-relaxed">
                Create and purchase labels for <span className="font-medium text-white">USPS</span>,{" "}
                <span className="font-medium text-white">UPS</span>,{" "}
                <span className="font-medium text-white">FedEx</span> &{" "}
                <span className="font-medium text-white">DHL</span> — then checkout securely.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                  Fast quotes
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                  Address autofill
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                  Cart + credits
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="fixed z-50 hidden bottom-6 right-6 sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}

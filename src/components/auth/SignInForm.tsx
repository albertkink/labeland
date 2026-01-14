import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";

export default function SignInForm() {
  const navigate = useNavigate();
  const [isChecked, setIsChecked] = useState(false);
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!hash.trim()) {
      setError("Hash is required.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: hash.trim() }),
      }).catch((fetchError) => {
        // Handle QUIC protocol errors and network errors
        if (fetchError instanceof TypeError) {
          const errorMsg = fetchError.message.toLowerCase();
          if (errorMsg.includes("quic") || errorMsg.includes("protocol")) {
            throw new Error("Connection error due to protocol mismatch. Please refresh the page and try again.");
          } else if (errorMsg.includes("failed to fetch") || errorMsg.includes("network")) {
            throw new Error("Unable to connect to server. Please check your connection and try again.");
          }
        }
        throw fetchError;
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
            : `Login failed (HTTP ${r.status}).`;
        throw new Error(msg);
      }

      const token =
        data && typeof data === "object"
          ? (data as { token?: unknown }).token
          : null;
      const user =
        data && typeof data === "object"
          ? (data as { user?: unknown }).user
          : null;
      if (typeof token !== "string" || !token) {
        throw new Error("Login failed (missing token).");
      }

      localStorage.setItem("auth.token", token);
      if (user) localStorage.setItem("auth.user", JSON.stringify(user));
      localStorage.setItem("auth.keep", isChecked ? "1" : "0");

      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setIsSubmitting(false);
    }
  };
  return (
    <div className="flex flex-col flex-1">
      <div className="w-full max-w-md pt-10 mx-auto">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon className="size-5" />
          Back to dashboard
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your hash to sign in!
            </p>
          </div>
          <div>
            <form onSubmit={handleSubmit}>
              {error ? (
                <div className="mb-4 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
                  {error}
                </div>
              ) : null}
              <div className="space-y-6">
                <div>
                  <Label>
                    Hash <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input
                    type="text"
                    placeholder="Enter your hash"
                    value={hash}
                    onChange={(e) => setHash(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={isChecked} onChange={setIsChecked} />
                    <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                      Keep me logged in
                    </span>
                  </div>
                </div>
                <div>
                  <Button
                    className="w-full"
                    size="sm"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Signing in..." : "Sign in"}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Don&apos;t have an account? {""}
                <Link
                  to="/signup"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Sign Up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

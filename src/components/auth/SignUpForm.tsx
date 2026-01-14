import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";

// Generate a random hash (64 characters)
function generateRandomHash(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let hash = "";
  for (let i = 0; i < 64; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}

export default function SignUpForm() {
  const navigate = useNavigate();
  const [isChecked, setIsChecked] = useState(false);
  const [generatedHash, setGeneratedHash] = useState<string | null>(null);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isChecked) {
      setError("You must accept the Terms and Conditions.");
      return;
    }

    // Generate a random hash
    const hash = generateRandomHash();
    setGeneratedHash(hash);

    setIsSubmitting(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          hash: hash, 
          telegramUsername: telegramUsername.trim() || undefined
        }),
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
            : `Sign up failed (HTTP ${r.status}).`;
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
        throw new Error("Sign up failed (missing token).");
      }

      localStorage.setItem("auth.token", token);
      if (user) localStorage.setItem("auth.user", JSON.stringify(user));
      localStorage.setItem("auth.keep", "1");
      
      // Store the hash in localStorage so user can access it later
      if (generatedHash) {
        localStorage.setItem("auth.generatedHash", generatedHash);
      }

      // Show hash for 3 seconds before navigating
      setTimeout(() => {
        navigate("/");
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
      setIsSubmitting(false);
    }
  };
  return (
    <div className="flex flex-col flex-1 w-full overflow-y-auto lg:w-1/2 no-scrollbar">
      <div className="w-full max-w-md mx-auto mb-5 sm:pt-10">
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
              Sign Up
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create your account! A unique hash will be generated for you.
            </p>
          </div>
          <div>
            <button className="inline-flex items-center justify-center w-full gap-3 py-3 text-sm font-normal text-gray-700 transition-colors bg-gray-100 rounded-lg px-7 hover:bg-gray-200 hover:text-gray-800 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10">
              <svg
                width="20"
                height="20"
                viewBox="0 0 240 240"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="telegram-gradient" x1="120" x2="120" y2="240" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#1d93d2"/>
                    <stop offset="1" stopColor="#38b0e3"/>
                  </linearGradient>
                </defs>
                <circle cx="120" cy="120" r="120" fill="url(#telegram-gradient)"/>
                <path d="M81.229,128.772l14.237,39.406s1.78,3.687,3.686,3.687,30.255-29.492,30.255-29.492l31.525-60.89L81.737,118.6Z" fill="#c8daea"/>
                <path d="M100.106,138.878l-2.733,29.046s-1.144,8.9,7.754,0,17.415-15.763,17.415-15.763" fill="#a9c6d8"/>
                <path d="M81.486,130.178,52.2,120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229,2.1-2.2,6.489-4.523,120.106-45.36,120.106-45.36s3.208-1.081,5.1-.362a2.766,2.766,0,0,1,1.885,2.055,9.357,9.357,0,0,1,.254,2.585c-.009.752-.1,1.449-.169,2.542-.692,11.165-21.4,94.493-21.4,94.493s-1.239,4.876-5.678,5.043A8.13,8.13,0,0,1,146.1,172.5c-8.711-7.493-38.819-27.727-45.472-32.177a1.27,1.27,0,0,1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6,53.821-51.492c.108-.379-.3-.566-.848-.4-3.482,1.281-63.844,39.4-70.506,43.607A3.21,3.21,0,0,1,81.486,130.178Z" fill="#fff"/>
              </svg>
              Sign up with Telegram
            </button>
            <div className="relative py-3 sm:py-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="p-2 text-gray-400 bg-white dark:bg-gray-900 sm:px-5 sm:py-2">
                  Or
                </span>
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              {error ? (
                <div className="mb-4 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
                  {error}
                </div>
              ) : null}
              <div className="space-y-5">
                {/* <!-- Generated Hash Display (after signup) --> */}
                {generatedHash && (
                  <div className="mb-4 rounded-lg border border-brand-500/30 bg-brand-500/10 px-4 py-3">
                    <p className="text-sm font-semibold text-brand-700 dark:text-brand-400 mb-2">
                      Your unique hash (save this!):
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono break-all">
                        {generatedHash}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedHash);
                        }}
                        className="px-3 py-1 text-xs bg-brand-500 text-white rounded hover:bg-brand-600"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      ⚠️ Save this hash! You'll need it to sign in.
                    </p>
                  </div>
                )}
                {/* <!-- Telegram or Signal Username --> */}
                <div>
                  <Label>
                    Telegram or Signal Username
                  </Label>
                  <Input
                    type="text"
                    id="telegramUsername"
                    name="telegramUsername"
                    placeholder="Enter your Telegram or Signal username (optional)"
                    value={telegramUsername}
                    onChange={(e) => setTelegramUsername(e.target.value)}
                  />
                </div>
                {/* <!-- Checkbox --> */}
                <div className="flex items-center gap-3">
                  <Checkbox
                    className="w-5 h-5"
                    checked={isChecked}
                    onChange={setIsChecked}
                  />
                  <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                    By creating an account means you agree to the{" "}
                    <span className="text-gray-800 dark:text-white/90">
                      Terms and Conditions,
                    </span>{" "}
                    and our{" "}
                    <span className="text-gray-800 dark:text-white">
                      Privacy Policy
                    </span>
                  </p>
                </div>
                {/* <!-- Button --> */}
                <div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="sm"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Signing up..." : "Sign Up"}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                Already have an account? {""}
                <Link
                  to="/signin"
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Sign In
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

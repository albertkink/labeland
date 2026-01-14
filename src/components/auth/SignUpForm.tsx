import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
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

// Generate a random name
function generateRandomName(): string {
  const adjectives = ["Cool", "Swift", "Bright", "Bold", "Sharp", "Quick", "Smart", "Brave", "Calm", "Wild", "Silent", "Fierce", "Gentle", "Wise", "Bold"];
  const nouns = ["Tiger", "Eagle", "Wolf", "Dragon", "Phoenix", "Lion", "Falcon", "Panther", "Shark", "Hawk", "Bear", "Fox", "Raven", "Jaguar", "Viper"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 9999);
  return `${adjective}${noun}${number}`;
}

export default function SignUpForm() {
  const navigate = useNavigate();
  const [hash, setHash] = useState<string>("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate hash on component mount
  useEffect(() => {
    const newHash = generateRandomHash();
    setHash(newHash);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hash.trim()) {
      setError("Hash is required.");
      return;
    }

    // Generate a random name
    const name = generateRandomName();

    setIsSubmitting(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          hash: hash.trim(), 
          username: name,
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
        
        // If hash already exists, generate a new hash automatically
        if (msg.includes("Hash already exists")) {
          const newHash = generateRandomHash();
          setHash(newHash);
          // Don't throw error, just show info message and let user retry
          setError("This hash was already used. A new hash has been generated automatically. Click 'Sign Up' again.");
          setIsSubmitting(false);
          return;
        }
        
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
      localStorage.setItem("auth.generatedHash", hash);

      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
      setIsSubmitting(false);
      // Don't reset hash if it was regenerated due to conflict
      // The hash state is already updated in the error handler above
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
            <form onSubmit={handleSubmit}>
              {error ? (
                <div className="mb-4 rounded-lg border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-700 dark:text-error-400">
                  {error}
                </div>
              ) : null}
              <div className="space-y-5">
                {/* <!-- Hash Input (read-only, auto-generated) --> */}
                <div>
                  <Label>
                    Your Hash<span className="text-error-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="text"
                      id="hash"
                      name="hash"
                      placeholder="Hash will be generated..."
                      value={hash}
                      disabled
                      className="bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(hash);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-brand-500 text-white rounded hover:bg-brand-600"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    ⚠️ Save this hash! You'll need it to sign in.
                  </p>
                </div>
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
                {/* <!-- Soul Selling Text --> */}
                <div className="flex items-center">
                  <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                    When creating account I sell my soul to <strong className="text-gray-800 dark:text-white/90">Albert</strong>
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

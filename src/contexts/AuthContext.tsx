import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { claimsFromAccessToken, type SessionClaims } from "../lib/authSession";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  claims: SessionClaims | null;
  name: string | null;
  setDisplayName: (name: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [claims, setClaims] = useState<SessionClaims | null>(null);
  // Not carried in the JWT (only role/org/location are), so this is
  // in-memory only — set at login, lost on a hard reload. Nothing in the
  // app currently depends on it surviving a reload; if that changes, it'd
  // need a real source (e.g. a users-lookup once a safe staff view exists).
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    function apply(accessToken: string | undefined) {
      const sessionClaims = accessToken
        ? claimsFromAccessToken(accessToken)
        : null;
      if (!sessionClaims) {
        setClaims(null);
        setStatus("unauthenticated");
        return;
      }
      setClaims(sessionClaims);
      setStatus("authenticated");
    }

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.access_token));

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => apply(session?.access_token),
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, claims, name, setDisplayName: setName }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

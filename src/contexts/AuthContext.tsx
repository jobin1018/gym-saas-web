import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
  organizationName: string | null;
  // Applies a freshly-minted session (from staff-login's response) AND its
  // display name together, in that order — see the long comment below on
  // why the ordering here specifically avoids a redundant getUser() call.
  completeLogin: (
    accessToken: string,
    refreshToken: string,
    name: string,
  ) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [claims, setClaims] = useState<SessionClaims | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(
    null,
  );

  // auth.users.user_metadata.name is the durable source (staff-login keeps
  // it in sync with public.users.name on every login), but a fresh login
  // already has the name in its own response — no need to round-trip to
  // getUser() again immediately after. This ref lets `apply()` below check
  // synchronously whether a name is already known, without needing `name`
  // itself in the effect's dependencies (which would force a resubscribe).
  const nameRef = useRef<string | null>(null);

  useEffect(() => {
    async function apply(accessToken: string | undefined) {
      const sessionClaims = accessToken
        ? claimsFromAccessToken(accessToken)
        : null;
      if (!sessionClaims) {
        setClaims(null);
        setStatus("unauthenticated");
        nameRef.current = null;
        setName(null);
        return;
      }
      setClaims(sessionClaims);
      setStatus("authenticated");

      // Only hit here on session restore (page reload) — a fresh login
      // populates nameRef synchronously via completeLogin() below, BEFORE
      // setSession() (which is what triggers this same code path via
      // onAuthStateChange) ever runs. If nameRef is already set, this whole
      // branch — and the network round trip — is skipped.
      if (!nameRef.current) {
        const { data } = await supabase.auth.getUser();
        const fetchedName = data.user?.user_metadata?.name;
        if (typeof fetchedName === "string") {
          nameRef.current = fetchedName;
          setName(fetchedName);
        }
      }
    }

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.access_token));

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => apply(session?.access_token),
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Unlike the display name, this DOES survive a reload — it's a real query
  // scoped by the JWT's org_id, not something threaded through from login.
  useEffect(() => {
    if (!claims) {
      setOrganizationName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("organizations_for_client")
      .select("name")
      .eq("id", claims.organizationId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setOrganizationName(data?.name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [claims]);

  async function completeLogin(
    accessToken: string,
    refreshToken: string,
    loginName: string,
  ): Promise<{ error: Error | null }> {
    // Set BEFORE setSession(): setSession() triggers onAuthStateChange (and
    // thus apply(), above) internally as part of its own execution, not
    // after it resolves — so nameRef must already hold the real value by
    // the time that fires, or apply() will (harmlessly, but needlessly)
    // fetch it again via getUser().
    nameRef.current = loginName;
    setName(loginName);
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { error };
  }

  return (
    <AuthContext.Provider
      value={{ status, claims, name, organizationName, completeLogin }}
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

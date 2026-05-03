import { useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Landmark, RefreshCw, Unlink, AlertCircle, DollarSign, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface PlaidStatus {
  configured: boolean;
}

interface PlaidConnection {
  id: number;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null;
  accountType: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

interface PlaidBalance {
  available: number | null;
  current: number | null;
  currency: string;
}

interface PlaidTransaction {
  date: string;
  description: string;
  amount: string;
  transactionType: string;
}

interface SyncResult {
  synced: number;
  batchId: number;
}

function formatCurrency(amount: number | null | undefined, currency = "USD") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Banking() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const { data: status } = useQuery<PlaidStatus>({
    queryKey: ["plaid-status"],
    queryFn: () => apiFetch("/api/plaid/status"),
    staleTime: Infinity,
  });

  const { data: connection, isLoading: connectionLoading } = useQuery<PlaidConnection | null>({
    queryKey: ["plaid-connection"],
    queryFn: () => apiFetch("/api/plaid/connection"),
  });

  const { data: balance, isLoading: balanceLoading } = useQuery<PlaidBalance>({
    queryKey: ["plaid-balance"],
    queryFn: () => apiFetch("/api/plaid/balance"),
    enabled: !!connection,
    retry: false,
  });

  const getLinkTokenMutation = useMutation({
    mutationFn: () => apiFetch<{ link_token: string }>("/api/plaid/link-token", { method: "POST" }),
    onSuccess: (data) => setLinkToken(data.link_token),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const exchangeMutation = useMutation({
    mutationFn: (body: { public_token: string; metadata: unknown }) =>
      apiFetch("/api/plaid/exchange-token", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-connection"] });
      qc.invalidateQueries({ queryKey: ["plaid-balance"] });
      setLinkToken(null);
      toast({ title: "Bank account connected!", description: "Your account is now linked." });
    },
    onError: (err: Error) => toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiFetch<SyncResult>("/api/plaid/sync", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["plaid-connection"] });
      toast({ title: "Sync complete", description: `${data.synced} transaction${data.synced !== 1 ? "s" : ""} imported.` });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch("/api/plaid/connection", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plaid-connection"] });
      qc.invalidateQueries({ queryKey: ["plaid-balance"] });
      toast({ title: "Bank account disconnected" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const onPlaidSuccess = useCallback(
    (public_token: string, metadata: unknown) => {
      exchangeMutation.mutate({ public_token, metadata });
    },
    [exchangeMutation]
  );

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: onPlaidSuccess,
    onExit: () => setLinkToken(null),
  });

  const handleConnectClick = async () => {
    await getLinkTokenMutation.mutateAsync();
  };

  if (linkToken && plaidReady) {
    openPlaid();
  }

  if (connectionLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground">Connect your business bank account to see live balance and transactions.</p>
        </div>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-4 pt-6">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Plaid credentials not configured</p>
              <p className="text-sm text-amber-700 mt-1">
                To connect your bank account, add these three secrets in the Replit Secrets panel:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-700 font-mono">
                <li>• PLAID_CLIENT_ID</li>
                <li>• PLAID_SECRET</li>
                <li>• PLAID_ENV (set to <span className="font-semibold">sandbox</span> for testing, <span className="font-semibold">production</span> when ready)</li>
              </ul>
              <p className="text-xs text-amber-600 mt-3">
                Get your free credentials at{" "}
                <a href="https://dashboard.plaid.com" target="_blank" rel="noreferrer" className="underline font-medium">
                  dashboard.plaid.com
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground">Connect your business bank account to see live balance and transactions.</p>
        </div>
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Landmark className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">No bank account linked</p>
              <p className="text-sm text-muted-foreground mt-1">
                Securely connect your business checking account to view your live balance and import recent transactions.
              </p>
            </div>
            <Button
              onClick={handleConnectClick}
              disabled={getLinkTokenMutation.isPending || exchangeMutation.isPending}
              size="lg"
              className="w-full"
            >
              {getLinkTokenMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Preparing…
                </>
              ) : (
                <>
                  <Landmark className="w-4 h-4 mr-2" />
                  Connect Bank Account
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDebit = (amount: string) => parseFloat(amount) < 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground">
            {connection.institutionName ?? "Connected Bank"}
            {connection.accountName ? ` · ${connection.accountName}` : ""}
            {connection.accountMask ? ` ····${connection.accountMask}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Transactions
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <Unlink className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect bank account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove your linked bank account and its credentials. Previously imported transactions will remain in Bank Reconciliation. You can re-connect at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => disconnectMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Current Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <div className="h-9 w-32 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">
                {formatCurrency(balance?.current, balance?.currency)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balanceLoading ? (
              <div className="h-9 w-32 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">
                {formatCurrency(balance?.available, balance?.currency)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {connection.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced: {new Date(connection.lastSyncedAt).toLocaleString()}
          {" · "}
          Transactions are stored in{" "}
          <a href="#/accounting" className="underline">Bank Reconciliation</a> for matching.
        </p>
      )}

      {!connection.lastSyncedAt && (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-5">
            <RefreshCw className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No transactions synced yet</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Click <span className="font-semibold">Sync Transactions</span> above to import the last 30 days of activity.
                Imported transactions appear in Bank Reconciliation where you can match them to expenses and invoices.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

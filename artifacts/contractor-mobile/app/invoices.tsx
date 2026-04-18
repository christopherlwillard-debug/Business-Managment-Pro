import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { usePaymentSession } from "@/context/PaymentSession";
import { useAuth } from "@/context/AuthContext";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

interface Invoice {
  id: number;
  invoiceNumber: string;
  clientName: string | null;
  total: string | null;
  balanceDue: string | null;
  status: string;
}

async function fetchOpenInvoices(token: string | null): Promise<Invoice[]> {
  if (!token) return [];
  const res = await fetch(`${BASE_URL}/api/invoices?status=sent&limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.invoices ?? data) as Invoice[];
}

export default function InvoicesScreen() {
  const { sessionToken } = useAuth();
  const { setPaymentDetails } = usePaymentSession();
  const [search, setSearch] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["openInvoices"],
    queryFn: () => fetchOpenInvoices(sessionToken),
  });

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.clientName?.toLowerCase().includes(q)
    );
  });

  function handleSelect(inv: Invoice) {
    const balanceDue = parseFloat(inv.balanceDue ?? inv.total ?? "0");
    const amountCents = Math.round(balanceDue * 100);
    setPaymentDetails({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      amountCents: amountCents > 0 ? amountCents : 0,
      description: `Invoice #${inv.invoiceNumber}`,
    });
    router.back();
  }

  function handleClear() {
    setPaymentDetails({
      invoiceId: null,
      invoiceNumber: null,
      clientName: null,
    });
    router.back();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Select Invoice</Text>
        <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search invoices..."
        placeholderTextColor="#94A3B8"
        value={search}
        onChangeText={setSearch}
      />

      {isLoading ? (
        <ActivityIndicator size="large" color="#1B3A6B" style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {search ? "No invoices match your search" : "No open invoices found"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const bal = parseFloat(item.balanceDue ?? item.total ?? "0");
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowNumber}>#{item.invoiceNumber}</Text>
                  <Text style={styles.rowClient}>{item.clientName ?? "—"}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowAmount}>
                    ${bal.toFixed(2)}
                  </Text>
                  <View style={[styles.badge, item.status === "overdue" && styles.badgeOverdue]}>
                    <Text style={styles.badgeText}>{item.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F9FC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 15, color: "#1B3A6B", fontFamily: "Inter_500Medium" },
  title: { fontSize: 17, fontWeight: "600", color: "#1B3A6B", fontFamily: "Inter_600SemiBold" },
  clearBtn: { padding: 8 },
  clearText: { fontSize: 15, color: "#EF4444", fontFamily: "Inter_500Medium" },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1B3A6B",
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  rowLeft: { gap: 2 },
  rowNumber: { fontSize: 15, fontWeight: "600", color: "#1B3A6B", fontFamily: "Inter_600SemiBold" },
  rowClient: { fontSize: 13, color: "#64748B", fontFamily: "Inter_400Regular" },
  rowRight: { alignItems: "flex-end", gap: 4 },
  rowAmount: { fontSize: 16, fontWeight: "700", color: "#1B3A6B", fontFamily: "Inter_700Bold" },
  badge: {
    backgroundColor: "#DBEAFE",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeOverdue: { backgroundColor: "#FEE2E2" },
  badgeText: { fontSize: 11, color: "#1B3A6B", fontFamily: "Inter_500Medium" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 15, color: "#94A3B8", fontFamily: "Inter_400Regular" },
});

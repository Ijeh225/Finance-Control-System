import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useLocalSearchParams } from 'expo-router';
import { useGetWallet, getGetWalletQueryKey } from '@workspace/api-client-react';
import type { WalletTransaction } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';

const TX_LABELS: Record<string, string> = {
  credit: 'Credit',
  debit: 'Debit',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
};

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const colors = useColors();
  const isCredit = tx.type === 'credit' || tx.type === 'transfer_in';
  return (
    <View style={[styles.txRow, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.txNarration, { color: colors.foreground }]} numberOfLines={1}>{tx.narration}</Text>
        <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
          {TX_LABELS[tx.type] ?? tx.type}
          {tx.relatedWalletName ? ` · ${tx.relatedWalletName}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.txAmount, { color: isCredit ? colors.primary : colors.destructive }]}>
          {isCredit ? '+' : '-'}
        </Text>
        <AmountText amount={tx.amount} style={[styles.txAmount, { color: isCredit ? colors.primary : colors.destructive }]} />
        <AmountText amount={tx.balanceAfter} style={[styles.txBalance, { color: colors.mutedForeground }]} />
      </View>
    </View>
  );
}

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: wallet, isLoading } = useGetWallet(
    id as string,
    { query: { enabled: !!id, queryKey: getGetWalletQueryKey(id as string) } }
  );

  if (isLoading || !wallet) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={wallet.recentTransactions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
              <Text style={[styles.bankLabel, { color: colors.primaryForeground }]}>
                {wallet.bankName} • {wallet.name}
              </Text>
              <AmountText
                amount={wallet.balance}
                style={[styles.balanceAmount, { color: colors.primaryForeground }]}
              />
              <Text style={[styles.accountNumber, { color: colors.primaryForeground }]}>
                {wallet.accountNumber}
              </Text>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Transactions</Text>
          </View>
        }
        renderItem={({ item }) => <TransactionRow tx={item} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 20 }
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ color: colors.mutedForeground }}>No recent transactions</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    gap: 24,
  },
  balanceCard: {
    padding: 24,
    borderRadius: 24,
    gap: 12,
  },
  bankLabel: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '800',
  },
  accountNumber: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
    opacity: 0.9,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  txNarration: {
    fontSize: 14,
    fontWeight: '600',
  },
  txMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  txBalance: {
    fontSize: 11,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});

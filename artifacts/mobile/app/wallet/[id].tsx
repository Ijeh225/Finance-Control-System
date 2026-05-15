import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useLocalSearchParams } from 'expo-router';
import { useGetWallet, getGetWalletQueryKey } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { BillCard } from '@/components/finance/BillCard';

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
        renderItem={({ item }) => <BillCard bill={item} />}
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
});

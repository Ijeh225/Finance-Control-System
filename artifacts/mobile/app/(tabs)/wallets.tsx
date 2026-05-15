import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useListWallets, getListWalletsQueryKey, useGetWalletBalances, getGetWalletBalancesQueryKey } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { router } from 'expo-router';

export default function WalletsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: walletsData, isLoading: isWalletsLoading } = useListWallets(
    { query: { queryKey: getListWalletsQueryKey() } }
  );

  const { data: balanceData } = useGetWalletBalances(
    { query: { queryKey: getGetWalletBalancesQueryKey() } }
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Wallets</Text>
        <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
          <Text style={[styles.totalLabel, { color: colors.primaryForeground }]}>TOTAL COMMAND BALANCE</Text>
          <AmountText 
            amount={balanceData?.totalBalance || 0} 
            style={[styles.totalAmount, { color: colors.primaryForeground }]} 
          />
        </View>
      </View>

      <FlatList
        data={walletsData?.wallets || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 84 }
        ]}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/wallet/${item.id}`)}
            style={({ pressed }) => [
              styles.walletCard,
              { backgroundColor: colors.card, borderColor: item.isLow ? colors.destructive : colors.border },
              pressed && { opacity: 0.7 }
            ]}
          >
            <View style={styles.walletHeader}>
              <View style={styles.walletInfo}>
                <Text style={[styles.walletName, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.bankName, { color: colors.mutedForeground }]}>{item.bankName}</Text>
              </View>
              <Feather name="credit-card" size={24} color={colors.primary} />
            </View>

            <View style={styles.balanceContainer}>
              <AmountText amount={item.balance} style={[styles.balanceAmount, { color: colors.foreground }]} />
              <Text style={[styles.currency, { color: colors.mutedForeground }]}>{item.currency}</Text>
            </View>

            {item.isLow && (
              <View style={[styles.lowBalanceBadge, { backgroundColor: colors.destructive + '20' }]}>
                <Feather name="alert-triangle" size={14} color={colors.destructive} />
                <Text style={[styles.lowBalanceText, { color: colors.destructive }]}>LOW BALANCE</Text>
              </View>
            )}

            <View style={[styles.accountNumber, { borderTopColor: colors.border }]}>
              <Text style={[styles.accountText, { color: colors.mutedForeground }]}>
                **** **** **** {item.accountNumber?.slice(-4)}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          isWalletsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Feather name="credit-card" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No wallets found</Text>
            </View>
          )
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
    paddingHorizontal: 20,
    gap: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
  },
  totalCard: {
    padding: 24,
    borderRadius: 20,
    gap: 8,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.8,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: '800',
  },
  listContent: {
    padding: 20,
  },
  walletCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    gap: 20,
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  walletInfo: {
    gap: 4,
  },
  walletName: {
    fontSize: 18,
    fontWeight: '700',
  },
  bankName: {
    fontSize: 14,
    fontWeight: '600',
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '800',
  },
  currency: {
    fontSize: 16,
    fontWeight: '600',
  },
  lowBalanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  lowBalanceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  accountNumber: {
    borderTopWidth: 1,
    paddingTop: 16,
  },
  accountText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

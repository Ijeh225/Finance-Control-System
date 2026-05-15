import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useGetOutstandingLiabilities, getGetOutstandingLiabilitiesQueryKey } from '@workspace/api-client-react';
import { useUser } from '@/context/UserContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';

export default function OutstandingLiabilitiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useUser();

  const { data, isLoading } = useGetOutstandingLiabilities(
    { userId: userId === 'all' ? undefined : userId },
    { query: { queryKey: getGetOutstandingLiabilitiesQueryKey({ userId: userId === 'all' ? undefined : userId }) } }
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const agingData = [
    { label: '0-7 Days', amount: data?.aging0to7 || 0 },
    { label: '8-14 Days', amount: data?.aging8to14 || 0 },
    { label: '15-30 Days', amount: data?.aging15to30 || 0 },
    { label: '30+ Days', amount: data?.aging30plus || 0 },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
          <Text style={[styles.summaryLabel, { color: colors.primaryForeground }]}>TOTAL OUTSTANDING</Text>
          <AmountText 
            amount={data?.totalOutstanding || 0} 
            style={[styles.summaryAmount, { color: colors.primaryForeground }]} 
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Aging Breakdown</Text>
        <View style={styles.agingGrid}>
          {agingData.map((item, index) => (
            <View key={index} style={[styles.agingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.agingLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
              <AmountText amount={item.amount} style={[styles.agingAmount, { color: colors.foreground }]} />
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>By Vendor</Text>
        {data?.byVendor.map((vendor, index) => (
          <View key={index} style={[styles.vendorRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.vendorName, { color: colors.foreground }]}>{vendor.vendorName}</Text>
            <AmountText amount={vendor.totalOutstanding} style={[styles.vendorAmount, { color: colors.foreground }]} />
          </View>
        ))}

        <View style={{ height: Platform.OS === 'web' ? 34 : insets.bottom + 20 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 24,
  },
  summaryCard: {
    padding: 24,
    borderRadius: 20,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.8,
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  agingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  agingCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  agingLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  agingAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  vendorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '600',
  },
  vendorAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
});

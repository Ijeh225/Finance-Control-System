import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform, FlatList } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useLocalSearchParams } from 'expo-router';
import { useGetVendor, getGetVendorQueryKey, useGetVendorLiabilities, getGetVendorLiabilitiesQueryKey } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { BillCard } from '@/components/finance/BillCard';

export default function VendorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: vendor, isLoading: isVendorLoading } = useGetVendor(
    id as string,
    { query: { enabled: !!id, queryKey: getGetVendorQueryKey(id as string) } }
  );

  const { data: liabilities, isLoading: isLiabilitiesLoading } = useGetVendorLiabilities(
    id as string,
    { query: { enabled: !!id, queryKey: getGetVendorLiabilitiesQueryKey(id as string) } }
  );

  if (isVendorLoading || !vendor) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const paidPercentage = vendor.totalBilled > 0 ? (vendor.totalPaid / vendor.totalBilled) : 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.name, { color: colors.foreground }]}>{vendor.name}</Text>
          <View style={styles.contactInfo}>
            {vendor.email && <Text style={{ color: colors.mutedForeground }}>{vendor.email}</Text>}
            {vendor.phone && <Text style={{ color: colors.mutedForeground }}>{vendor.phone}</Text>}
          </View>
        </View>

        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>PAYMENT PROGRESS</Text>
              <Text style={[styles.progressPercent, { color: colors.success }]}>
                {Math.round(paidPercentage * 100)}%
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { backgroundColor: colors.success, width: `${paidPercentage * 100}%` }
                ]} 
              />
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>TOTAL BILLED</Text>
              <AmountText amount={vendor.totalBilled} style={[styles.statValue, { color: colors.foreground }]} />
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>TOTAL PAID</Text>
              <AmountText amount={vendor.totalPaid} style={[styles.statValue, { color: colors.success }]} />
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>OUTSTANDING</Text>
              <AmountText amount={vendor.outstandingBalance} style={[styles.statValue, { color: colors.destructive }]} />
            </View>
          </View>
        </View>

        {liabilities && (
          <View style={styles.agingSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Liability Aging</Text>
            <View style={styles.agingGrid}>
              <View style={[styles.agingCard, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.agingLabel, { color: colors.mutedForeground }]}>0-7 Days</Text>
                <AmountText amount={liabilities.aging0to7} style={[styles.agingValue, { color: colors.foreground }]} />
              </View>
              <View style={[styles.agingCard, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.agingLabel, { color: colors.mutedForeground }]}>8-14 Days</Text>
                <AmountText amount={liabilities.aging8to14} style={[styles.agingValue, { color: colors.foreground }]} />
              </View>
              <View style={[styles.agingCard, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.agingLabel, { color: colors.mutedForeground }]}>15-30 Days</Text>
                <AmountText amount={liabilities.aging15to30} style={[styles.agingValue, { color: colors.foreground }]} />
              </View>
              <View style={[styles.agingCard, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.agingLabel, { color: colors.mutedForeground }]}>30+ Days</Text>
                <AmountText amount={liabilities.aging30plus} style={[styles.agingValue, { color: colors.foreground }]} />
              </View>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>All Bills</Text>
        {vendor.bills.map((bill) => (
          <BillCard key={bill.id} bill={bill} />
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
  header: {
    gap: 8,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
  },
  contactInfo: {
    gap: 4,
  },
  statsCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 24,
  },
  progressSection: {
    gap: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  progressPercent: {
    fontSize: 18,
    fontWeight: '800',
  },
  progressBar: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statItem: {
    flex: 1,
    minWidth: '40%',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  agingSection: {
    gap: 16,
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
    gap: 4,
  },
  agingLabel: {
    fontSize: 12,
  },
  agingValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useListVendors, getListVendorsQueryKey } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { router } from 'expo-router';

export default function VendorsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useListVendors(
    { search: search || undefined },
    { query: { queryKey: getListVendorsQueryKey({ search: search || undefined }) } }
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Vendors</Text>
        
        <View style={[styles.searchBar, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search vendors..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <FlatList
        data={data?.vendors || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 84 }
        ]}
        renderItem={({ item }) => {
          const paidPercentage = item.totalBilled > 0 ? (item.totalPaid / item.totalBilled) : 0;
          
          return (
            <Pressable
              onPress={() => router.push(`/vendor/${item.id}`)}
              style={({ pressed }) => [
                styles.vendorCard,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { opacity: 0.7 }
              ]}
            >
              <View style={styles.vendorHeader}>
                <Text style={[styles.vendorName, { color: colors.foreground }]}>{item.name}</Text>
                <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
              </View>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>TOTAL BILLED</Text>
                  <AmountText amount={item.totalBilled} style={[styles.statValue, { color: colors.foreground }]} />
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>OUTSTANDING</Text>
                  <AmountText amount={item.outstandingBalance} style={[styles.statValue, { color: colors.destructive }]} />
                </View>
              </View>

              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { 
                        backgroundColor: colors.success, 
                        width: `${paidPercentage * 100}%` 
                      }
                    ]} 
                  />
                </View>
                <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                  {Math.round(paidPercentage * 100)}% Paid
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Feather name="users" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No vendors found</Text>
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
    gap: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  listContent: {
    padding: 20,
  },
  vendorCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    gap: 16,
  },
  vendorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vendorName: {
    fontSize: 18,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    gap: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
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

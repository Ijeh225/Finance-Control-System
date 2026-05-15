import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useListBills, getListBillsQueryKey, BillStatus } from '@workspace/api-client-react';
import { useUser } from '@/context/UserContext';
import { BillCard } from '@/components/finance/BillCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_FILTERS: { label: string; value: BillStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'On Hold', value: 'on_hold' },
  { label: 'Partial', value: 'partial' },
  { label: 'Paid', value: 'paid' },
];

export default function BillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useUser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BillStatus | 'all'>('all');

  const { data, isLoading } = useListBills(
    { 
      userId: userId === 'all' ? undefined : userId,
      status: statusFilter === 'all' ? undefined : statusFilter,
    },
    { query: { queryKey: getListBillsQueryKey({ 
      userId: userId === 'all' ? undefined : userId,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }) } }
  );

  const filteredBills = data?.bills.filter(bill => 
    bill.vendorName.toLowerCase().includes(search.toLowerCase()) ||
    bill.description.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Bills</Text>
        
        <View style={[styles.searchBar, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search bills..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.filters}
          contentContainerStyle={styles.filtersContent}
        >
          {STATUS_FILTERS.map((filter) => (
            <Pressable
              key={filter.value}
              onPress={() => setStatusFilter(filter.value)}
              style={[
                styles.filterChip,
                { backgroundColor: colors.card, borderColor: colors.border },
                statusFilter === filter.value && { backgroundColor: colors.primary, borderColor: colors.primary }
              ]}
            >
              <Text 
                style={[
                  styles.filterText, 
                  { color: colors.foreground },
                  statusFilter === filter.value && { color: colors.primaryForeground }
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredBills}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BillCard bill={item} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 84 }
        ]}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Feather name="file-text" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No bills found</Text>
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
  filters: {
    flexGrow: 0,
  },
  filtersContent: {
    gap: 8,
    paddingRight: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
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

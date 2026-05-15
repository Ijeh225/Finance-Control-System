import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useGetOverdueBills, getGetOverdueBillsQueryKey, useEscalateBill } from '@workspace/api-client-react';
import { useUser } from '@/context/UserContext';
import { BillCard } from '@/components/finance/BillCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OverdueBillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useUser();

  const { data, isLoading, refetch } = useGetOverdueBills(
    { userId: userId === 'all' ? undefined : userId },
    { query: { queryKey: getGetOverdueBillsQueryKey({ userId: userId === 'all' ? undefined : userId }) } }
  );

  const escalateMutation = useEscalateBill();

  const handleEscalate = async (billId: string) => {
    try {
      await escalateMutation.mutateAsync({ billId, data: { comment: 'Escalated from overdue list' } });
      refetch();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={data?.bills || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <BillCard bill={item} />
            <View style={styles.cardOverlay}>
              <View style={[styles.overdueDays, { backgroundColor: colors.destructive }]}>
                <Text style={styles.overdueText}>{item.overdueDays} DAYS OVERDUE</Text>
              </View>
              <Pressable 
                style={[styles.escalateBtn, { backgroundColor: colors.card, borderColor: colors.destructive }]}
                onPress={() => handleEscalate(item.id)}
              >
                <Feather name="arrow-up-circle" size={16} color={colors.destructive} />
                <Text style={[styles.escalateText, { color: colors.destructive }]}>ESCALATE</Text>
              </Pressable>
            </View>
          </View>
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 20 }
        ]}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Feather name="check-circle" size={48} color={colors.success} />
              <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>No overdue bills</Text>
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
  listContent: {
    padding: 20,
  },
  cardOverlay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 16,
  },
  overdueDays: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  overdueText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },
  escalateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  escalateText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
});

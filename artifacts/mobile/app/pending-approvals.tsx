import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useGetPendingApprovals, getGetPendingApprovalsQueryKey, useApproveBill, useRejectBill, useHoldBill, usePartialApproveBill } from '@workspace/api-client-react';
import { useUser } from '@/context/UserContext';
import { BillCard } from '@/components/finance/BillCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet, ActionOption } from '@/components/finance/ActionSheet';
import * as Haptics from 'expo-haptics';

export default function PendingApprovalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useUser();
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGetPendingApprovals(
    { userId: userId === 'all' ? undefined : userId },
    { query: { queryKey: getGetPendingApprovalsQueryKey({ userId: userId === 'all' ? undefined : userId }) } }
  );

  const approveMutation = useApproveBill();
  const rejectMutation = useRejectBill();
  const holdMutation = useHoldBill();
  const partialMutation = usePartialApproveBill();

  const actionOptions: ActionOption[] = [
    { id: 'approve', label: 'Full Approve', icon: 'check-circle', color: colors.success },
    { id: 'partial', label: 'Partial Approve', icon: 'pie-chart', color: '#3B82F6', requiresAmount: true },
    { id: 'reject', label: 'Reject', icon: 'x-circle', color: colors.destructive },
    { id: 'hold', label: 'On Hold', icon: 'pause-circle', color: '#F59E0B' },
  ];

  const handleAction = async (actionId: string, comment: string, amount?: number) => {
    if (!selectedBillId) return;

    try {
      if (actionId === 'approve') {
        await approveMutation.mutateAsync({ billId: selectedBillId, data: { comment } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (actionId === 'partial' && amount) {
        await partialMutation.mutateAsync({ billId: selectedBillId, data: { comment, approvedAmount: amount } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (actionId === 'reject') {
        await rejectMutation.mutateAsync({ billId: selectedBillId, data: { comment } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (actionId === 'hold') {
        await holdMutation.mutateAsync({ billId: selectedBillId, data: { comment } });
        Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
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
            <View style={styles.actions}>
              <Pressable 
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => setSelectedBillId(item.id)}
              >
                <Feather name="shield" size={18} color={colors.primaryForeground} />
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Review & Approve</Text>
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
              <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>All bills approved</Text>
            </View>
          )
        }
      />

      <ActionSheet
        isVisible={!!selectedBillId}
        onClose={() => setSelectedBillId(null)}
        title="Review Bill"
        options={actionOptions}
        onAction={handleAction}
        isLoading={approveMutation.isPending || rejectMutation.isPending || holdMutation.isPending || partialMutation.isPending}
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: -8,
    marginBottom: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
});

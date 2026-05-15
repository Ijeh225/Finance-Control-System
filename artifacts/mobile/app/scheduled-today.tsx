import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useGetScheduledToday, getGetScheduledTodayQueryKey, useApproveBill, useRejectBill, useHoldBill, useAddBillComment } from '@workspace/api-client-react';
import { useUser } from '@/context/UserContext';
import { BillCard } from '@/components/finance/BillCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheet, ActionOption } from '@/components/finance/ActionSheet';
import * as Haptics from 'expo-haptics';

export default function ScheduledTodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useUser();
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGetScheduledToday(
    { userId: userId === 'all' ? undefined : userId },
    { query: { queryKey: getGetScheduledTodayQueryKey({ userId: userId === 'all' ? undefined : userId }) } }
  );

  const approveMutation = useApproveBill();
  const rejectMutation = useRejectBill();
  const holdMutation = useHoldBill();
  const commentMutation = useAddBillComment();

  const actionOptions: ActionOption[] = [
    { id: 'approve', label: 'Approve', icon: 'check-circle', color: colors.success },
    { id: 'reject', label: 'Reject', icon: 'x-circle', color: colors.destructive },
    { id: 'hold', label: 'Hold', icon: 'pause-circle', color: '#F59E0B' },
    { id: 'comment', label: 'Comment', icon: 'message-square', color: colors.primary },
  ];

  const handleAction = async (actionId: string, comment: string) => {
    if (!selectedBillId) return;

    try {
      if (actionId === 'approve') {
        await approveMutation.mutateAsync({ billId: selectedBillId, data: { comment } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (actionId === 'reject') {
        await rejectMutation.mutateAsync({ billId: selectedBillId, data: { comment } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (actionId === 'hold') {
        await holdMutation.mutateAsync({ billId: selectedBillId, data: { comment } });
        Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (actionId === 'comment') {
        await commentMutation.mutateAsync({ billId: selectedBillId, data: { text: comment, authorId: 'md' } });
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
                style={[styles.actionBtn, { backgroundColor: colors.card }]}
                onPress={() => setSelectedBillId(item.id)}
              >
                <Feather name="more-horizontal" size={20} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>Actions</Text>
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
              <Text style={{ color: colors.mutedForeground }}>No bills scheduled for today</Text>
            </View>
          )
        }
      />

      <ActionSheet
        isVisible={!!selectedBillId}
        onClose={() => setSelectedBillId(null)}
        title="Bill Actions"
        options={actionOptions}
        onAction={handleAction}
        isLoading={approveMutation.isPending || rejectMutation.isPending || holdMutation.isPending || commentMutation.isPending}
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
});

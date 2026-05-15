import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform, Pressable, Alert } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useLocalSearchParams } from 'expo-router';
import {
  useGetBill,
  getGetBillQueryKey,
  getListBillsQueryKey,
  useApproveBill,
  useRejectBill,
  useHoldBill,
  usePartialApproveBill,
  useAddBillComment,
  useEscalateBill,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { PriorityBadge } from '@/components/finance/PriorityBadge';
import { ActionSheet, ActionOption } from '@/components/finance/ActionSheet';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';

const ACTION_LABELS: Record<string, string> = {
  approve: 'Bill approved',
  partial: 'Partial approval recorded',
  reject: 'Bill rejected',
  hold: 'Bill placed on hold',
  escalate: 'Bill escalated to urgent',
  comment: 'Comment added',
};

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { user: authUser } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);

  const { data: bill, isLoading, refetch } = useGetBill(
    id as string,
    { query: { enabled: !!id, queryKey: getGetBillQueryKey(id as string) } }
  );

  const approveMutation = useApproveBill();
  const rejectMutation = useRejectBill();
  const holdMutation = useHoldBill();
  const partialMutation = usePartialApproveBill();
  const commentMutation = useAddBillComment();
  const escalateMutation = useEscalateBill();

  const isMd = authUser?.role === 'md';

  const actionOptions: ActionOption[] = [
    { id: 'approve', label: 'Approve', icon: 'check-circle', color: colors.success },
    { id: 'partial', label: 'Partial Approve', icon: 'pie-chart', color: '#3B82F6', requiresAmount: true },
    { id: 'reject', label: 'Reject', icon: 'x-circle', color: colors.destructive },
    { id: 'hold', label: 'Hold', icon: 'pause-circle', color: '#F59E0B' },
    { id: 'escalate', label: 'Escalate', icon: 'alert-triangle', color: '#EF4444' },
    { id: 'comment', label: 'Add Comment', icon: 'message-square', color: colors.primary },
  ];

  const handleAction = async (actionId: string, comment: string, amount?: number) => {
    if (!id) return;

    try {
      if (actionId === 'approve') {
        await approveMutation.mutateAsync({ id: id as string, data: { comment } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (actionId === 'partial' && amount) {
        await partialMutation.mutateAsync({ id: id as string, data: { comment, approvedAmount: amount } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (actionId === 'reject') {
        await rejectMutation.mutateAsync({ id: id as string, data: { comment } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (actionId === 'hold') {
        await holdMutation.mutateAsync({ id: id as string, data: { comment } });
        Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (actionId === 'escalate') {
        await escalateMutation.mutateAsync({ id: id as string, data: { comment } });
        Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else if (actionId === 'comment') {
        await commentMutation.mutateAsync({ id: id as string, data: { text: comment, authorId: authUser?.id ?? '' } });
      }

      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() }),
      ]);

      Alert.alert('Done', ACTION_LABELS[actionId] ?? 'Action completed.');
    } catch (error) {
      console.error('[BillDetail] action error:', error);
      Alert.alert('Action Failed', 'Could not complete the action. Please check your connection and try again.');
    }
  };

  if (isLoading || !bill) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, isMd && styles.scrollContentWithBar]}>
        <View style={styles.header}>
          <Text style={[styles.vendor, { color: colors.foreground }]}>{bill.vendorName}</Text>
          <AmountText amount={bill.amount} style={[styles.amount, { color: colors.primary }]} />
          <View style={styles.badges}>
            <StatusBadge status={bill.status} />
            <PriorityBadge priority={bill.priority} />
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Description</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{bill.description}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Scheduled Date</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>
              {new Date(bill.scheduledDate).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Created By</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{bill.createdByName}</Text>
          </View>
          {bill.walletName && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Wallet</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{bill.walletName}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Audit Trail</Text>
        <View style={styles.timeline}>
          {bill.auditTrail.map((entry, index) => (
            <View key={index} style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
              {index < bill.auditTrail.length - 1 && (
                <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
              )}
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineAction, { color: colors.foreground }]}>{entry.action}</Text>
                <Text style={[styles.timelineUser, { color: colors.mutedForeground }]}>
                  {entry.userName} • {new Date(entry.createdAt).toLocaleString()}
                </Text>
                {entry.details && (
                  <Text style={[styles.timelineDetails, { color: colors.secondaryForeground }]}>{entry.details}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Comments</Text>
        {bill.comments.map((comment, index) => (
          <View key={index} style={[styles.commentCard, { backgroundColor: colors.secondary }]}>
            <View style={styles.commentHeader}>
              <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{comment.authorName}</Text>
              <Text style={[styles.commentDate, { color: colors.mutedForeground }]}>
                {new Date(comment.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={[styles.commentText, { color: colors.foreground }]}>{comment.text}</Text>
          </View>
        ))}
      </ScrollView>

      {isMd && (
        <>
          <View style={[styles.bottomBar, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 24) }]}>
            <Pressable
              style={[styles.mainActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => setIsActionSheetVisible(true)}
            >
              <Text style={[styles.mainActionText, { color: colors.primaryForeground }]}>Take Action</Text>
            </Pressable>
          </View>

          <ActionSheet
            isVisible={isActionSheetVisible}
            onClose={() => setIsActionSheetVisible(false)}
            title="Command Control"
            options={actionOptions}
            onAction={handleAction}
            isLoading={
              approveMutation.isPending ||
              rejectMutation.isPending ||
              holdMutation.isPending ||
              partialMutation.isPending ||
              commentMutation.isPending ||
              escalateMutation.isPending
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 24,
  },
  scrollContentWithBar: {
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    gap: 12,
  },
  vendor: {
    fontSize: 24,
    fontWeight: '800',
  },
  amount: {
    fontSize: 36,
    fontWeight: '800',
  },
  badges: {
    flexDirection: 'row',
    gap: 12,
  },
  infoCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
  },
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  timeline: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 16,
    minHeight: 80,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
    zIndex: 1,
  },
  timelineLine: {
    position: 'absolute',
    left: 5,
    top: 18,
    bottom: 0,
    width: 2,
  },
  timelineContent: {
    flex: 1,
    gap: 4,
  },
  timelineAction: {
    fontSize: 16,
    fontWeight: '700',
  },
  timelineUser: {
    fontSize: 12,
  },
  timelineDetails: {
    fontSize: 14,
    marginTop: 4,
  },
  commentCard: {
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '700',
  },
  commentDate: {
    fontSize: 12,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  mainActionBtn: {
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  mainActionText: {
    fontSize: 18,
    fontWeight: '800',
  },
});

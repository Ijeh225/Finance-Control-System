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
  useListBillAttachments,
  getListBillAttachmentsQueryKey,
  useRequestBillAttachmentUpload,
  useConfirmBillAttachment,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { PriorityBadge } from '@/components/finance/PriorityBadge';
import { ActionSheet, ActionOption } from '@/components/finance/ActionSheet';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/octet-stream',
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [isUploading, setIsUploading] = useState(false);

  const billId = id as string;

  const { data: bill, isLoading, refetch } = useGetBill(
    billId,
    { query: { enabled: !!billId, queryKey: getGetBillQueryKey(billId) } }
  );

  const { data: attachmentsData, refetch: refetchAttachments } = useListBillAttachments(
    billId,
    { query: { enabled: !!billId, queryKey: getListBillAttachmentsQueryKey(billId) } }
  );

  const requestUploadMutation = useRequestBillAttachmentUpload();
  const confirmMutation = useConfirmBillAttachment();

  const approveMutation = useApproveBill();
  const rejectMutation = useRejectBill();
  const holdMutation = useHoldBill();
  const partialMutation = usePartialApproveBill();
  const commentMutation = useAddBillComment();
  const escalateMutation = useEscalateBill();

  const isMd = authUser?.role === 'md';
  const attachments = attachmentsData?.attachments ?? [];

  const actionOptions: ActionOption[] = [
    { id: 'approve', label: 'Approve', icon: 'check-circle', color: colors.success },
    { id: 'partial', label: 'Partial Approve', icon: 'pie-chart', color: '#3B82F6', requiresAmount: true },
    { id: 'reject', label: 'Reject', icon: 'x-circle', color: colors.destructive },
    { id: 'hold', label: 'Hold', icon: 'pause-circle', color: '#F59E0B' },
    { id: 'escalate', label: 'Escalate', icon: 'alert-triangle', color: '#EF4444' },
    { id: 'comment', label: 'Add Comment', icon: 'message-square', color: colors.primary },
  ];

  const handleAttachFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      const mimeType = asset.mimeType ?? 'application/octet-stream';
      const fileSize = asset.size ?? 0;
      const fileName = asset.name;

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        Alert.alert('Invalid File Type', 'Please attach a PDF, image, Word, Excel, or CSV file.');
        return;
      }

      if (fileSize > MAX_FILE_SIZE) {
        Alert.alert('File Too Large', 'The file must be smaller than 20 MB.');
        return;
      }

      setIsUploading(true);

      // Step 1: request presigned upload URL
      const uploadResp = await requestUploadMutation.mutateAsync({
        id: billId,
        data: { fileName, fileSize, mimeType },
      });

      const { attachmentId, uploadUrl } = uploadResp;

      // Step 2: fetch file as blob and PUT to presigned URL
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });

      if (!putRes.ok) {
        throw new Error(`Storage upload failed: ${putRes.status}`);
      }

      // Step 3: confirm the upload
      await confirmMutation.mutateAsync({ id: billId, attachmentId });

      await Promise.all([
        refetchAttachments(),
        queryClient.invalidateQueries({ queryKey: getListBillAttachmentsQueryKey(billId) }),
      ]);

      Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uploaded', `${fileName} attached successfully.`);
    } catch {
      Alert.alert('Upload Failed', 'Could not upload the file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (attachmentId: string) => {
    const url = `${API_BASE}/api/attachments/${attachmentId}/download`;
    await WebBrowser.openBrowserAsync(url);
  };

  const handleAction = async (actionId: string, comment: string, amount?: number) => {
    if (!billId) return;

    try {
      if (actionId === 'approve') {
        await approveMutation.mutateAsync({ id: billId, data: { comment } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (actionId === 'partial' && amount) {
        await partialMutation.mutateAsync({ id: billId, data: { comment, approvedAmount: amount } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (actionId === 'reject') {
        await rejectMutation.mutateAsync({ id: billId, data: { comment } });
        Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (actionId === 'hold') {
        await holdMutation.mutateAsync({ id: billId, data: { comment } });
        Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (actionId === 'escalate') {
        await escalateMutation.mutateAsync({ id: billId, data: { comment } });
        Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else if (actionId === 'comment') {
        await commentMutation.mutateAsync({ id: billId, data: { text: comment, authorId: authUser?.id ?? '' } });
      }

      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() }),
      ]);

      Alert.alert('Done', ACTION_LABELS[actionId] ?? 'Action completed.');
    } catch {
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

        {/* Attachments */}
        <View>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
            </Text>
            <Pressable
              style={[
                styles.attachBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
                isUploading && { opacity: 0.6 },
              ]}
              onPress={handleAttachFile}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.attachBtnText, { color: colors.primary }]}>+ Attach File</Text>
              )}
            </Pressable>
          </View>

          {attachments.length === 0 ? (
            <View style={[styles.emptyAttachments, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No attachments yet</Text>
            </View>
          ) : (
            <View style={[styles.attachmentList, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {attachments.map((attachment, index) => (
                <Pressable
                  key={attachment.id}
                  style={[
                    styles.attachmentRow,
                    index < attachments.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                  onPress={() => handleDownload(attachment.id)}
                >
                  <View style={styles.attachmentInfo}>
                    <Text style={[styles.attachmentName, { color: colors.primary }]} numberOfLines={1}>
                      {attachment.fileName}
                    </Text>
                    <Text style={[styles.attachmentMeta, { color: colors.mutedForeground }]}>
                      {[
                        attachment.uploadedByName,
                        new Date(attachment.uploadedAt).toLocaleDateString(),
                        formatBytes(attachment.fileSize),
                      ].filter(Boolean).join(' \u2022 ')}
                    </Text>
                  </View>
                  <Text style={[styles.downloadArrow, { color: colors.primary }]}>{'\u2193'}</Text>
                </Pressable>
              ))}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  attachBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  attachBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyAttachments: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  attachmentList: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  attachmentInfo: {
    flex: 1,
    gap: 4,
  },
  attachmentName: {
    fontSize: 14,
    fontWeight: '600',
  },
  attachmentMeta: {
    fontSize: 12,
  },
  downloadArrow: {
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

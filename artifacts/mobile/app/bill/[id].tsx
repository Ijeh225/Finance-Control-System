import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform,
  Pressable, Alert, Modal, TextInput, KeyboardAvoidingView,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useColors } from '@/hooks/useColors';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  useWithdrawBill,
  useUpdateBill,
  useListVendors,
  getListVendorsQueryKey,
  useListWallets,
  getListWalletsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { PriorityBadge } from '@/components/finance/PriorityBadge';
import { ActionSheet, ActionOption } from '@/components/finance/ActionSheet';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { useUploadQueue, isRetryableUploadError } from '@/context/UploadQueueContext';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

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

const ACTION_ERRORS: Record<string, string> = {
  approve: 'Could not approve the bill. Please try again.',
  partial: 'Could not record the partial approval. Please try again.',
  reject: 'Could not reject the bill. Please try again.',
  hold: 'Could not place the bill on hold. Please try again.',
  escalate: 'Could not escalate the bill. Please try again.',
  comment: 'Could not add the comment. Please check your connection.',
};

type Priority = 'low' | 'medium' | 'high' | 'urgent';

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { user: authUser } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isEditVisible, setIsEditVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    description: '',
    amount: '',
    scheduledDate: '',
    dueDate: '',
    priority: 'medium' as Priority,
    vendorId: '',
    walletId: '',
  });

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
  const withdrawMutation = useWithdrawBill();
  const updateMutation = useUpdateBill();

  const { data: vendorsData } = useListVendors(undefined, {
    query: { queryKey: getListVendorsQueryKey(), enabled: isEditVisible },
  });
  const { data: walletsData } = useListWallets(undefined, {
    query: { queryKey: getListWalletsQueryKey(), enabled: isEditVisible },
  });
  const vendors = vendorsData?.vendors ?? [];
  const wallets = walletsData?.wallets ?? [];

  const { queue, enqueue } = useUploadQueue();
  const pendingUploads = queue.filter((q) => q.billId === billId);

  const prevPendingCountRef = useRef(pendingUploads.length);
  useEffect(() => {
    if (prevPendingCountRef.current > 0 && pendingUploads.length < prevPendingCountRef.current) {
      refetchAttachments();
      queryClient.invalidateQueries({ queryKey: getListBillAttachmentsQueryKey(billId) });
    }
    prevPendingCountRef.current = pendingUploads.length;
  }, [pendingUploads.length]);

  const isMd = authUser?.role === 'md';
  const canAttach = authUser?.role === 'md' || authUser?.role === 'payment_assistant';
  const attachments = attachmentsData?.attachments ?? [];
  const canWithdraw = !isMd && bill?.status === 'pending' && bill?.createdBy === authUser?.id;
  const canEdit = isMd
    ? bill != null && !['approved', 'paid'].includes(bill.status ?? '')
    : bill?.status === 'pending' && bill?.createdBy === authUser?.id;

  const openEdit = () => {
    if (!bill) return;
    setEditForm({
      description: bill.description ?? '',
      amount: String(bill.amount ?? ''),
      scheduledDate: bill.scheduledDate ?? '',
      dueDate: bill.dueDate ?? '',
      priority: (bill.priority as Priority) ?? 'medium',
      vendorId: bill.vendorId ?? '',
      walletId: bill.walletId ?? '',
    });
    setIsEditVisible(true);
  };

  const handleWithdraw = () => {
    Alert.alert(
      'Withdraw Bill',
      'This will permanently delete the bill. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawMutation.mutateAsync({ id: billId });
              await queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
              Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch {
              Alert.alert('Withdraw Failed', 'Could not withdraw the bill. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleEditSave = async () => {
    if (!billId) return;
    const parsedAmount = parseFloat(editForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: billId,
        data: {
          description: editForm.description || undefined,
          amount: parsedAmount,
          scheduledDate: editForm.scheduledDate || undefined,
          dueDate: editForm.dueDate || undefined,
          priority: editForm.priority,
          vendorId: editForm.vendorId || undefined,
          walletId: editForm.walletId || undefined,
        },
      });
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() }),
      ]);
      setIsEditVisible(false);
      Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Bill updated successfully.');
    } catch {
      Alert.alert('Update Failed', 'Could not save changes. Please try again.');
    }
  };

  const actionOptions: ActionOption[] = [
    { id: 'approve', label: 'Approve', icon: 'check-circle', color: colors.success },
    { id: 'partial', label: 'Partial Approve', icon: 'pie-chart', color: '#3B82F6', requiresAmount: true },
    { id: 'reject', label: 'Reject', icon: 'x-circle', color: colors.destructive },
    { id: 'hold', label: 'Hold', icon: 'pause-circle', color: '#F59E0B' },
    { id: 'escalate', label: 'Escalate', icon: 'alert-triangle', color: '#EF4444' },
    { id: 'comment', label: 'Add Comment', icon: 'message-square', color: colors.primary },
  ];

  const handleAttachFile = async () => {
    // Pick the file first (separate try so errors here show distinct messages)
    let pickedFileName = '';
    let pickedFileUri = '';
    let pickedMimeType = '';
    let pickedFileSize: number | null = null;

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

      pickedFileName = asset.name;
      pickedFileUri = asset.uri;
      pickedMimeType = asset.mimeType ?? 'application/octet-stream';
      pickedFileSize = asset.size ?? null;
    } catch {
      Alert.alert('File Error', 'Could not open the file picker. Please try again.');
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(pickedMimeType)) {
      Alert.alert('Invalid File Type', 'Please attach a PDF, image, Word, Excel, or CSV file.');
      return;
    }

    if (pickedFileSize !== null && pickedFileSize > MAX_FILE_SIZE) {
      Alert.alert('File Too Large', 'The file must be smaller than 20 MB.');
      return;
    }

    // Check connectivity before attempting upload
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      await enqueue({
        billId,
        fileName: pickedFileName,
        fileUri: pickedFileUri,
        mimeType: pickedMimeType,
        fileSize: pickedFileSize,
      });
      Alert.alert(
        'Queued',
        `${pickedFileName} will upload automatically when you're back online.`,
      );
      return;
    }

    setIsUploading(true);

    try {
      // Step 1: request presigned upload URL
      const uploadResp = await requestUploadMutation.mutateAsync({
        id: billId,
        data: { fileName: pickedFileName, fileSize: pickedFileSize ?? undefined, mimeType: pickedMimeType },
      });

      const { attachmentId, uploadUrl } = uploadResp;

      // Step 2: fetch file as blob and PUT to presigned URL with progress tracking
      const fileRes = await fetch(pickedFileUri);
      const blob = await fileRes.blob();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', pickedMimeType);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(blob);
      });

      // Step 3: confirm the upload
      await confirmMutation.mutateAsync({ id: billId, attachmentId });

      await Promise.all([
        refetchAttachments(),
        queryClient.invalidateQueries({ queryKey: getListBillAttachmentsQueryKey(billId) }),
      ]);

      Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uploaded', `${pickedFileName} attached successfully.`);
    } catch (err) {
      if (isRetryableUploadError(err)) {
        // Network or server failure — queue for automatic retry when back online
        await enqueue({
          billId,
          fileName: pickedFileName,
          fileUri: pickedFileUri,
          mimeType: pickedMimeType,
          fileSize: pickedFileSize,
        });
        Alert.alert(
          'Queued',
          `${pickedFileName} will upload automatically when you're back online.`,
        );
      } else {
        // Permanent failure (auth/validation) — inform the user and don't queue
        Alert.alert('Upload Failed', 'Could not upload the file. Please check your session and try again.');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDownload = async (attachmentId: string, fileName: string) => {
    try {
      const url = `${API_BASE}/api/attachments/${attachmentId}/download`;
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const localPath = (FileSystem.cacheDirectory ?? '') + safeFileName;
      // downloadAsync uses the native HTTP client which shares the session cookie jar
      const result = await FileSystem.downloadAsync(url, localPath);
      if (result.status !== 200) {
        Alert.alert('Download Failed', 'Could not download the file. Please try again.');
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        Alert.alert('Downloaded', `${fileName} saved to device.`);
      }
    } catch {
      Alert.alert('Download Failed', 'Could not download the file. Please try again.');
    }
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
      Alert.alert('Action Failed', ACTION_ERRORS[actionId] ?? 'Could not complete the action. Please check your connection and try again.');
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
          {(canEdit || canWithdraw) && (
            <View style={styles.creatorActions}>
              {canEdit && (
                <Pressable
                  style={[styles.creatorActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={openEdit}
                >
                  <Text style={[styles.creatorActionText, { color: colors.primary }]}>Edit</Text>
                </Pressable>
              )}
              {canWithdraw && (
                <Pressable
                  style={[styles.creatorActionBtn, { backgroundColor: '#1f0a0a', borderColor: '#7f1d1d' }]}
                  onPress={handleWithdraw}
                  disabled={withdrawMutation.isPending}
                >
                  <Text style={[styles.creatorActionText, { color: '#f87171' }]}>
                    {withdrawMutation.isPending ? 'Withdrawing…' : 'Withdraw'}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
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
              Attachments{(attachments.length + pendingUploads.length) > 0 ? ` (${attachments.length + pendingUploads.length})` : ''}
            </Text>
            {canAttach && (
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
            )}
          </View>
          {isUploading && uploadProgress !== null && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` as `${number}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{uploadProgress}%</Text>
            </View>
          )}

          {pendingUploads.length > 0 && (
            <View style={[styles.attachmentList, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8 }]}>
              {pendingUploads.map((pending, index) => (
                <View
                  key={pending.id}
                  style={[
                    styles.attachmentRow,
                    index < pendingUploads.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={styles.attachmentInfo}>
                    <Text style={[styles.attachmentName, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {pending.fileName}
                    </Text>
                    <Text style={[styles.attachmentMeta, { color: '#F59E0B' }]}>
                      Queued — will upload when online
                    </Text>
                  </View>
                  <ActivityIndicator size="small" color="#F59E0B" />
                </View>
              ))}
            </View>
          )}

          {attachments.length === 0 && pendingUploads.length === 0 ? (
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
                  onPress={() => handleDownload(attachment.id, attachment.fileName)}
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

      {/* Edit Bill Modal */}
      <Modal visible={isEditVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Bill</Text>
              <Pressable onPress={() => setIsEditVisible(false)}>
                <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={{ gap: 16 }}>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  value={editForm.description}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, description: v }))}
                  placeholder="Bill description"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />
              </View>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Amount (NGN)</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  value={editForm.amount}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, amount: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Scheduled Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  value={editForm.scheduledDate}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, scheduledDate: v }))}
                  placeholder="2026-01-15"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Due Date (YYYY-MM-DD, optional)</Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
                  value={editForm.dueDate}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, dueDate: v }))}
                  placeholder="2026-01-30"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Priority</Text>
                <View style={styles.priorityRow}>
                  {(['low', 'medium', 'high', 'urgent'] as Priority[]).map((p) => (
                    <Pressable
                      key={p}
                      style={[
                        styles.priorityChip,
                        { borderColor: colors.border, backgroundColor: colors.card },
                        editForm.priority === p && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => setEditForm((f) => ({ ...f, priority: p }))}
                    >
                      <Text style={[
                        styles.priorityChipText,
                        { color: editForm.priority === p ? colors.primaryForeground : colors.foreground },
                      ]}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {vendors.length > 0 && (
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Vendor</Text>
                  <View style={[styles.pickerList, { borderColor: colors.border }]}>
                    {vendors.map((v, idx) => {
                      const selected = editForm.vendorId === v.id;
                      return (
                        <Pressable
                          key={v.id}
                          style={[
                            styles.pickerItem,
                            { borderColor: colors.border },
                            idx < vendors.length - 1 && styles.pickerItemBorder,
                            selected && { backgroundColor: colors.primary + '22' },
                          ]}
                          onPress={() => setEditForm((f) => ({ ...f, vendorId: v.id }))}
                        >
                          <View style={styles.pickerItemInner}>
                            <Text style={[
                              styles.pickerItemName,
                              { color: selected ? colors.primary : colors.foreground },
                            ]}>
                              {v.name}
                            </Text>
                            {v.bankName && (
                              <Text style={[styles.pickerItemSub, { color: colors.mutedForeground }]}>
                                {v.bankName}
                              </Text>
                            )}
                          </View>
                          {selected && (
                            <Text style={[styles.pickerCheck, { color: colors.primary }]}>✓</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {wallets.length > 0 && (
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Wallet</Text>
                  <View style={[styles.pickerList, { borderColor: colors.border }]}>
                    {wallets.map((w, idx) => {
                      const selected = editForm.walletId === w.id;
                      return (
                        <Pressable
                          key={w.id}
                          style={[
                            styles.pickerItem,
                            { borderColor: colors.border },
                            idx < wallets.length - 1 && styles.pickerItemBorder,
                            selected && { backgroundColor: colors.primary + '22' },
                          ]}
                          onPress={() => setEditForm((f) => ({ ...f, walletId: w.id }))}
                        >
                          <View style={styles.pickerItemInner}>
                            <Text style={[
                              styles.pickerItemName,
                              { color: selected ? colors.primary : colors.foreground },
                            ]}>
                              {w.name}
                            </Text>
                            {w.bankName && (
                              <Text style={[styles.pickerItemSub, { color: colors.mutedForeground }]}>
                                {w.bankName}
                              </Text>
                            )}
                          </View>
                          {selected && (
                            <Text style={[styles.pickerCheck, { color: colors.primary }]}>✓</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>
            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary }, updateMutation.isPending && { opacity: 0.7 }]}
                onPress={handleEditSave}
                disabled={updateMutation.isPending}
              >
                <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  creatorActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  creatorActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  creatorActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'right',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCancel: {
    fontSize: 16,
  },
  modalBody: {
    flex: 1,
    padding: 20,
  },
  modalFooter: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 44,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  priorityChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  priorityChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '800',
  },
  pickerList: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  pickerItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerItemInner: {
    flex: 1,
    gap: 2,
  },
  pickerItemName: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickerItemSub: {
    fontSize: 12,
  },
  pickerCheck: {
    fontSize: 16,
    fontWeight: '800',
  },
});

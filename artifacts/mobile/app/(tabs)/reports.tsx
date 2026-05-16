import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import {
  useGetOutstandingLiabilities,
  getGetOutstandingLiabilitiesQueryKey,
  useGetPendingApprovals,
  getGetPendingApprovalsQueryKey,
  useGetPaidToday,
  getGetPaidTodayQueryKey,
  useGetPartialPayments,
  getGetPartialPaymentsQueryKey,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type ReportType = 'outstanding-liabilities' | 'pending-approvals' | 'paid-today' | 'partial-payments';

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

async function downloadAndShareReport(type: ReportType, format: 'excel' | 'pdf' = 'excel') {
  const url = `${API_BASE}/api/export/reports/${type}?format=${format}`;
  const ext = format === 'excel' ? 'xlsx' : 'pdf';
  const mimeType =
    format === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';

  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Export failed: ${response.status}`);
  }

  const blob = await response.blob();

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });

  const filename = `fincommand-${type}-${new Date().toISOString().split('T')[0]}.${ext}`;
  const fileUri = `${FileSystem.documentDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle: 'Export Report',
      UTI: format === 'excel' ? 'com.microsoft.excel.xlsx' : 'com.adobe.pdf',
    });
  } else {
    Alert.alert('Sharing not available', 'File saved to: ' + fileUri);
  }
}

function ReportCard({
  title,
  icon,
  iconColor,
  accentColor,
  primaryStat,
  secondaryStat,
  reportType,
  isLoading,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  accentColor: string;
  primaryStat: string;
  secondaryStat?: string;
  reportType: ReportType;
  isLoading: boolean;
}) {
  const colors = useColors();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadAndShareReport(reportType, 'excel');
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: accentColor + '20' }]}>
          <Feather name={icon} size={20} color={iconColor} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
      ) : (
        <View style={styles.statsRow}>
          <Text style={[styles.primaryStat, { color: colors.foreground }]}>{primaryStat}</Text>
          {secondaryStat ? (
            <Text style={[styles.secondaryStat, { color: colors.mutedForeground }]}>
              {secondaryStat}
            </Text>
          ) : null}
        </View>
      )}

      <Pressable
        onPress={handleExport}
        disabled={exporting || isLoading}
        style={({ pressed }) => [
          styles.exportBtn,
          { backgroundColor: colors.primary, opacity: pressed || exporting ? 0.7 : 1 },
        ]}
        accessibilityLabel={`Export ${title}`}
      >
        {exporting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Feather name="download" size={14} color="#fff" />
            <Text style={styles.exportBtnText}>Export Excel</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.role !== 'md' ? user?.id : undefined;
  const params = userId ? { userId } : undefined;

  const { data: outstanding, isLoading: outstandingLoading } = useGetOutstandingLiabilities(
    params,
    { query: { queryKey: getGetOutstandingLiabilitiesQueryKey(params) } }
  );

  const { data: pendingApprovals, isLoading: pendingLoading } = useGetPendingApprovals(
    params,
    { query: { queryKey: getGetPendingApprovalsQueryKey(params) } }
  );

  const { data: paidToday, isLoading: paidTodayLoading } = useGetPaidToday(
    params,
    { query: { queryKey: getGetPaidTodayQueryKey(params) } }
  );

  const { data: partialPayments, isLoading: partialLoading } = useGetPartialPayments(
    params,
    { query: { queryKey: getGetPartialPaymentsQueryKey(params) } }
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === 'web' ? 67 : insets.top,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Reports</Text>
        {user?.role === 'md' && (
          <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>ALL USERS</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 84 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ReportCard
          title="Outstanding Liabilities"
          icon="alert-circle"
          iconColor={colors.destructive}
          accentColor={colors.destructive}
          reportType="outstanding-liabilities"
          isLoading={outstandingLoading}
          primaryStat={formatCurrency(outstanding?.totalOutstanding ?? 0)}
          secondaryStat={
            outstanding?.byVendor
              ? `${outstanding.byVendor.length} vendor${outstanding.byVendor.length !== 1 ? 's' : ''}`
              : undefined
          }
        />

        <ReportCard
          title="Pending Approvals"
          icon="clock"
          iconColor={colors.warning}
          accentColor={colors.warning}
          reportType="pending-approvals"
          isLoading={pendingLoading}
          primaryStat={formatCurrency(pendingApprovals?.total ?? 0)}
          secondaryStat={
            pendingApprovals !== undefined
              ? `${pendingApprovals.count} bill${pendingApprovals.count !== 1 ? 's' : ''} awaiting action`
              : undefined
          }
        />

        <ReportCard
          title="Paid Today"
          icon="check-circle"
          iconColor={colors.success}
          accentColor={colors.success}
          reportType="paid-today"
          isLoading={paidTodayLoading}
          primaryStat={formatCurrency(paidToday?.total ?? 0)}
          secondaryStat={
            paidToday !== undefined
              ? `${paidToday.count} payment${paidToday.count !== 1 ? 's' : ''} disbursed`
              : undefined
          }
        />

        <ReportCard
          title="Partial Payments"
          icon="git-commit"
          iconColor={colors.primary}
          accentColor={colors.primary}
          reportType="partial-payments"
          isLoading={partialLoading}
          primaryStat={formatCurrency(partialPayments?.total ?? 0)}
          secondaryStat={
            partialPayments !== undefined
              ? `${partialPayments.bills.length} bill${partialPayments.bills.length !== 1 ? 's' : ''} partially paid`
              : undefined
          }
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  statsRow: {
    gap: 4,
  },
  primaryStat: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  secondaryStat: {
    fontSize: 13,
    fontWeight: '500',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  exportBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

import React, { useState, useMemo } from 'react';
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
  type Bill,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type DatePreset = 'all' | 'today' | 'week' | 'month';
type ReportType = 'outstanding-liabilities' | 'pending-approvals' | 'paid-today' | 'partial-payments';

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

function getDateRange(preset: DatePreset): { from?: string; to?: string } {
  const todayStr = new Date().toISOString().split('T')[0]!;
  if (preset === 'all') return {};
  if (preset === 'today') return { from: todayStr, to: todayStr };
  if (preset === 'week') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().split('T')[0]!, to: todayStr };
  }
  if (preset === 'month') {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return { from: d.toISOString().split('T')[0]!, to: todayStr };
  }
  return {};
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s?: string | null) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  approved: '#10B981',
  paid: '#14B8A6',
  partial: '#8B5CF6',
  rejected: '#EF4444',
  overdue: '#F43F5E',
  on_hold: '#0EA5E9',
};

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

function BillRow({
  bill,
  amountKey,
  colors,
}: {
  bill: Bill;
  amountKey: 'amount' | 'paidAmount' | 'outstandingBalance';
  colors: ReturnType<typeof useColors>;
}) {
  const statusColor = STATUS_COLORS[bill.status ?? 'pending'] ?? colors.mutedForeground;
  const amount =
    amountKey === 'amount'
      ? bill.amount
      : amountKey === 'paidAmount'
      ? bill.paidAmount
      : bill.outstandingBalance;

  return (
    <Pressable
      onPress={() => router.push(`/bill/${bill.id}`)}
      style={({ pressed }) => [
        billStyles.row,
        { borderColor: colors.border, backgroundColor: pressed ? colors.muted + '30' : 'transparent' },
      ]}
      accessibilityLabel={`Open bill for ${bill.vendorName}`}
    >
      <View style={billStyles.rowLeft}>
        <Text style={[billStyles.vendor, { color: colors.foreground }]} numberOfLines={1}>
          {bill.vendorName}
        </Text>
        {bill.dueDate ? (
          <Text style={[billStyles.dueDate, { color: colors.mutedForeground }]}>
            Due {formatDate(bill.dueDate)}
          </Text>
        ) : null}
      </View>
      <View style={billStyles.rowRight}>
        <Text style={[billStyles.amount, { color: colors.foreground }]}>
          {formatCurrency(amount ?? 0)}
        </Text>
        <View style={[billStyles.statusPill, { backgroundColor: statusColor + '20' }]}>
          <Text style={[billStyles.statusText, { color: statusColor }]}>
            {(bill.status ?? '').replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={14} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
    </Pressable>
  );
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
  bills,
  amountKey,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  accentColor: string;
  primaryStat: string;
  secondaryStat?: string;
  reportType: ReportType;
  isLoading: boolean;
  bills?: Bill[];
  amountKey: 'amount' | 'paidAmount' | 'outstandingBalance';
}) {
  const colors = useColors();
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const PREVIEW_COUNT = 3;
  const visibleBills = bills ? (expanded ? bills : bills.slice(0, PREVIEW_COUNT)) : [];
  const hasMore = (bills?.length ?? 0) > PREVIEW_COUNT;

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

      {!isLoading && visibleBills.length > 0 && (
        <View style={[billStyles.list, { borderTopColor: colors.border }]}>
          {visibleBills.map(b => (
            <BillRow key={b.id} bill={b} amountKey={amountKey} colors={colors} />
          ))}
          {hasMore && (
            <Pressable
              onPress={() => setExpanded(e => !e)}
              style={billStyles.toggleBtn}
              accessibilityLabel={expanded ? 'Show fewer bills' : 'Show all bills'}
            >
              <Text style={[billStyles.toggleText, { color: colors.primary }]}>
                {expanded
                  ? 'Show less'
                  : `+ ${(bills?.length ?? 0) - PREVIEW_COUNT} more`}
              </Text>
              <Feather
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.primary}
              />
            </Pressable>
          )}
        </View>
      )}

      {!isLoading && bills !== undefined && bills.length === 0 && (
        <View style={billStyles.emptyBills}>
          <Text style={[billStyles.emptyBillsText, { color: colors.mutedForeground }]}>
            No bills in this period
          </Text>
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

  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const dateRange = useMemo(() => getDateRange(datePreset), [datePreset]);

  const params = { ...(userId ? { userId } : {}), ...dateRange };

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

      {/* Date preset filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetRow}
        style={styles.presetScroll}
      >
        {DATE_PRESETS.map(p => {
          const active = datePreset === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => setDatePreset(p.key)}
              style={[
                styles.presetChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              accessibilityLabel={`Filter by ${p.label}`}
            >
              <Text
                style={[
                  styles.presetChipText,
                  { color: active ? '#fff' : colors.mutedForeground },
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
          bills={outstanding?.bills}
          amountKey="outstandingBalance"
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
          bills={pendingApprovals?.bills}
          amountKey="amount"
        />

        <ReportCard
          title={datePreset === 'all' ? 'Paid Today' : 'Paid'}
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
          bills={paidToday?.bills}
          amountKey="paidAmount"
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
          bills={partialPayments?.bills}
          amountKey="outstandingBalance"
        />
      </ScrollView>
    </View>
  );
}

const billStyles = StyleSheet.create({
  list: {
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    gap: 6,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  vendor: {
    fontSize: 13,
    fontWeight: '600',
  },
  dueDate: {
    fontSize: 11,
    fontWeight: '500',
  },
  amount: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBills: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  emptyBillsText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
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
  presetScroll: {
    flexGrow: 0,
  },
  presetRow: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 16,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
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

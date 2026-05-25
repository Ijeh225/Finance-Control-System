import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useGetRecentActivity,
  getGetRecentActivityQueryKey,
  useListUsers,
  type AuditEntry,
} from '@workspace/api-client-react';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { router } from 'expo-router';

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

type ActionMeta = { label: string; icon: keyof typeof Feather.glyphMap; color: string };

function getActionMeta(action: string, colors: ReturnType<typeof useColors>): ActionMeta {
  switch (action) {
    case 'created':
      return { label: 'Submitted', icon: 'plus-circle', color: '#6366F1' };
    case 'edited':
      return { label: 'Edited', icon: 'edit-2', color: colors.mutedForeground };
    case 'approved':
      return { label: 'Approved', icon: 'check-circle', color: colors.success };
    case 'rejected':
      return { label: 'Rejected', icon: 'x-circle', color: colors.destructive };
    case 'held':
      return { label: 'On Hold', icon: 'pause-circle', color: colors.warning };
    case 'partial_approved':
      return { label: 'Partial', icon: 'pie-chart', color: '#3B82F6' };
    case 'escalated':
      return { label: 'Escalated', icon: 'alert-triangle', color: '#EF4444' };
    case 'commented':
      return { label: 'Comment', icon: 'message-square', color: colors.primary };
    case 'transfer':
      return { label: 'Transfer', icon: 'repeat', color: '#14B8A6' };
    default:
      return { label: action, icon: 'activity', color: colors.mutedForeground };
  }
}

function ActivityRow({
  entry,
  colors,
  onPress,
}: {
  entry: AuditEntry;
  colors: ReturnType<typeof useColors>;
  onPress: (entry: AuditEntry) => void;
}) {
  const meta = getActionMeta(entry.action, colors);
  const canNavigate = !!entry.billId;
  const description = entry.billDescription ?? entry.details ?? meta.label;

  return (
    <Pressable
      testID={`activity-row-${entry.id}`}
      onPress={() => onPress(entry)}
      disabled={!canNavigate}
      style={({ pressed }) => [
        styles.activityRow,
        { borderBottomColor: colors.border },
        pressed && canNavigate && { opacity: 0.7 },
      ]}
      accessibilityRole={canNavigate ? 'button' : undefined}
    >
      <View style={[styles.activityBadge, { backgroundColor: meta.color + '22' }]}>
        <Feather name={meta.icon} size={14} color={meta.color} />
      </View>
      <View style={styles.activityContent}>
        <Text style={[styles.activityDescription, { color: colors.foreground }]} numberOfLines={1}>
          {description}
        </Text>
        <Text style={[styles.activityMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          <Text style={{ color: meta.color, fontWeight: '600' }}>{meta.label}</Text>
          {' · '}
          {entry.userName}
        </Text>
      </View>
      <View style={styles.activityRight}>
        <Text style={[styles.activityTime, { color: colors.mutedForeground }]}>
          {entry.createdAt ? formatRelative(String(entry.createdAt)) : '—'}
        </Text>
        {canNavigate && (
          <Feather name="chevron-right" size={14} color={colors.border} />
        )}
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId, setUserId, isMD } = useUser();
  const { user, logout } = useAuth();
  const [isUserSwitcherVisible, setIsUserSwitcherVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleActivityPress = useCallback((entry: AuditEntry) => {
    if (entry.billId) router.push(`/bill/${entry.billId}`);
  }, []);

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { await logout(); router.replace('/login'); },
      },
    ]);
  }

  const effectiveUserId = userId === 'all' ? undefined : userId;

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useGetDashboardSummary(
    { userId: effectiveUserId },
    { query: { queryKey: getGetDashboardSummaryQueryKey({ userId: effectiveUserId }) } }
  );

  const { data: activityData, isLoading: isActivityLoading, refetch: refetchActivity } = useGetRecentActivity(
    { userId: effectiveUserId, limit: 10 },
    { query: { queryKey: getGetRecentActivityQueryKey({ userId: effectiveUserId, limit: 10 }) } }
  );

  const { data: usersData } = useListUsers();

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchSummary(), refetchActivity()]);
    setIsRefreshing(false);
  }, [refetchSummary, refetchActivity]);

  const summaryCards = [
    { label: 'Scheduled Today', count: summary?.scheduledTodayCount, amount: summary?.scheduledTodayAmount, route: '/scheduled-today' },
    { label: 'Tomorrow', count: summary?.scheduledTomorrowCount, amount: summary?.scheduledTomorrowAmount, route: '/scheduled-tomorrow' },
    { label: 'Pending Approval', count: summary?.pendingApprovalCount, amount: summary?.pendingApprovalAmount, route: '/pending-approvals', highlight: true },
    { label: 'Approved Unpaid', count: summary?.approvedUnpaidCount, amount: summary?.approvedUnpaidAmount, route: '/bills?status=approved' },
    { label: 'Wallet Balances', amount: summary?.totalWalletBalance, route: '/(tabs)/wallets', success: true },
    { label: 'Paid Today', count: summary?.paidTodayCount, amount: summary?.paidTodayAmount, route: '/bills?status=paid', success: true },
    { label: 'Partial Payments', count: summary?.partialPaymentsCount, route: '/bills?status=partial' },
  ];

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View>
        <Text style={[styles.appName, { color: colors.primary }]}>FinCommand</Text>
        {isMD ? (
          <Pressable
            style={styles.userSwitcher}
            onPress={() => setIsUserSwitcherVisible(!isUserSwitcherVisible)}
          >
            <Text style={[styles.userName, { color: colors.foreground }]}>
              {userId === 'all' ? 'All Users' : usersData?.users.find(u => u.id === userId)?.name || userId} ▼
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.userName, { color: colors.mutedForeground }]}>{user?.name}</Text>
        )}
      </View>
      <View style={styles.headerActions}>
        <Pressable style={styles.notificationBtn} onPress={() => router.push('/(tabs)/alerts')}>
          <Feather name="bell" size={22} color={colors.foreground} />
          {summary?.unreadNotificationsCount ? (
            <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
              <Text style={styles.badgeText}>{summary.unreadNotificationsCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.notificationBtn} onPress={handleSignOut}>
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );

  const activities = activityData?.activities ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 84 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {isSummaryLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.grid}>
            {summaryCards.map((card, index) => (
              <Pressable
                key={index}
                onPress={() => router.push(card.route as any)}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  card.highlight && { borderColor: colors.primary, borderWidth: 2 },
                ]}
              >
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>{card.label}</Text>
                {card.amount !== undefined && (
                  <AmountText
                    amount={card.amount}
                    variant="large"
                    style={[
                      styles.cardAmount,
                      { color: card.success ? colors.success : colors.foreground }
                    ]}
                  />
                )}
                {card.count !== undefined && (
                  <Text style={[styles.cardCount, { color: colors.mutedForeground }]}>
                    {card.count} {card.count === 1 ? 'item' : 'items'}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.recentSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Activity</Text>

          {isActivityLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : activities.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <Feather name="activity" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No recent activity</Text>
            </View>
          ) : (
            <View style={[styles.activityList, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {activities.map((entry) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  colors={colors}
                  onPress={handleActivityPress}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {isUserSwitcherVisible && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, top: (Platform.OS === 'web' ? 67 : insets.top) + 60 }]}>
          <Pressable
            style={styles.dropdownItem}
            onPress={() => { setUserId('all'); setIsUserSwitcherVisible(false); }}
          >
            <Text style={[styles.dropdownText, { color: userId === 'all' ? colors.primary : colors.foreground }]}>
              All Users
            </Text>
          </Pressable>
          {usersData?.users.map((u) => (
            <Pressable
              key={u.id}
              style={styles.dropdownItem}
              onPress={() => {
                setUserId(u.id);
                setIsUserSwitcherVisible(false);
              }}
            >
              <Text style={[styles.dropdownText, { color: userId === u.id ? colors.primary : colors.foreground }]}>
                {u.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 10,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  userSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notificationBtn: {
    padding: 8,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cardAmount: {
    fontSize: 20,
    fontWeight: '800',
  },
  cardCount: {
    fontSize: 12,
  },
  recentSection: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  activityList: {
    borderWidth: 1,
    borderRadius: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activityBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityContent: {
    flex: 1,
    gap: 2,
  },
  activityDescription: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  activityMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  activityTime: {
    fontSize: 11,
    lineHeight: 16,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
  },
  dropdown: {
    position: 'absolute',
    left: 20,
    width: 200,
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 100,
  },
  dropdownItem: {
    padding: 12,
    borderRadius: 8,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

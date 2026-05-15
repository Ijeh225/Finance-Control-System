import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, useListUsers } from '@workspace/api-client-react';
import { useUser } from '@/context/UserContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { router } from 'expo-router';

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId, setUserId } = useUser();
  const [isUserSwitcherVisible, setIsUserSwitcherVisible] = useState(false);

  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary(
    { userId: userId === 'all' ? undefined : userId },
    { query: { queryKey: getGetDashboardSummaryQueryKey({ userId: userId === 'all' ? undefined : userId }) } }
  );

  const { data: usersData } = useListUsers();

  const summaryCards = [
    { label: 'Scheduled Today', count: summary?.scheduledTodayCount, amount: summary?.scheduledTodayAmount, route: '/scheduled-today' },
    { label: 'Tomorrow', count: summary?.scheduledTomorrowCount, amount: summary?.scheduledTomorrowAmount, route: '/scheduled-tomorrow' },
    { label: 'Pending Approval', count: summary?.pendingApprovalCount, amount: summary?.pendingApprovalAmount, route: '/pending-approvals', highlight: true },
    { label: 'Approved Unpaid', count: summary?.approvedUnpaidCount, amount: summary?.approvedUnpaidAmount, route: '/bills?status=approved' },
    { label: 'Outstanding Liabilities', amount: summary?.totalOutstandingLiabilities, route: '/outstanding', fullWidth: true },
    { label: 'Overdue Bills', count: summary?.overdueCount, amount: summary?.overdueAmount, route: '/overdue', alert: true },
    { label: 'Wallet Balances', amount: summary?.totalWalletBalance, route: '/(tabs)/wallets', success: true },
    { label: 'Paid Today', count: summary?.paidTodayCount, amount: summary?.paidTodayAmount, route: '/bills?status=paid', success: true },
    { label: 'Partial Payments', count: summary?.partialPaymentsCount, route: '/bills?status=partial' },
  ];

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View>
        <Text style={[styles.appName, { color: colors.primary }]}>FinCommand</Text>
        <Pressable 
          style={styles.userSwitcher} 
          onPress={() => setIsUserSwitcherVisible(!isUserSwitcherVisible)}
        >
          <Text style={[styles.userName, { color: colors.foreground }]}>
            {userId === 'all' ? 'All Users' : usersData?.users.find(u => u.id === userId)?.name || userId} ▼
          </Text>
        </Pressable>
      </View>
      <Pressable style={styles.notificationBtn} onPress={() => router.push('/(tabs)/alerts')}>
        <Feather name="bell" size={24} color={colors.foreground} />
        {summary?.unreadNotificationsCount ? (
          <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
            <Text style={styles.badgeText}>{summary.unreadNotificationsCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}
      
      <ScrollView 
        contentContainerStyle={[
          styles.scrollContent, 
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 84 }
        ]}
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
                  card.fullWidth && styles.fullWidthCard,
                  card.highlight && { borderColor: colors.primary, borderWidth: 2 },
                  card.alert && { borderColor: colors.destructive },
                ]}
              >
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>{card.label}</Text>
                {card.amount !== undefined && (
                  <AmountText 
                    amount={card.amount} 
                    variant="large"
                    style={[
                      styles.cardAmount, 
                      { color: card.success ? colors.success : card.alert ? colors.destructive : colors.foreground }
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
          {/* Recent Activity component would go here */}
          <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Coming soon...</Text>
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
          {usersData?.users.map((user) => (
            <Pressable
              key={user.id}
              style={styles.dropdownItem}
              onPress={() => {
                setUserId(user.id);
                setIsUserSwitcherVisible(false);
              }}
            >
              <Text style={[styles.dropdownText, { color: userId === user.id ? colors.primary : colors.foreground }]}>
                {user.name}
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
  fullWidthCard: {
    width: '100%',
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

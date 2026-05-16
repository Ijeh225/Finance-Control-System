import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import {
  useListNotifications,
  getListNotificationsQueryKey,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  NotificationType,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Tabs } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = authUser?.id ?? '';

  const notificationsQueryKey = getListNotificationsQueryKey({ userId: currentUserId });

  const { data, isLoading, refetch } = useListNotifications(
    { userId: currentUserId },
    { query: { enabled: !!currentUserId, queryKey: notificationsQueryKey } }
  );

  const unreadCount = data?.unreadCount ?? 0;

  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead } = useMarkAllNotificationsRead();

  const invalidateAndRefetch = () => {
    queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    refetch();
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'bill_approved': return { name: 'check-circle' as const, color: colors.success };
      case 'bill_rejected': return { name: 'x-circle' as const, color: colors.destructive };
      case 'bill_partial': return { name: 'git-branch' as const, color: colors.warning };
      case 'bill_held': return { name: 'pause-circle' as const, color: colors.warning };
      case 'comment_added': return { name: 'message-square' as const, color: colors.primary };
      case 'overdue_warning': return { name: 'alert-triangle' as const, color: colors.destructive };
      case 'wallet_low': return { name: 'alert-circle' as const, color: colors.warning };
      case 'attachment_uploaded': return { name: 'paperclip' as const, color: colors.primary };
      case 'escalated': return { name: 'arrow-up-circle' as const, color: colors.destructive };
      case 'duplicate_detected': return { name: 'copy' as const, color: colors.warning };
      default: return { name: 'bell' as const, color: colors.primary };
    }
  };

  const handleMarkAllRead = () => {
    markAllRead(
      { data: { userId: currentUserId } },
      { onSuccess: invalidateAndRefetch }
    );
  };

  const handleNotificationPress = (notification: { id: string; isRead: boolean; billId?: string | null }) => {
    if (notification.billId) {
      router.push(`/bill/${notification.billId}`);
    }
  };

  const handleMarkOneRead = (id: string) => {
    markRead({ id }, { onSuccess: invalidateAndRefetch });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <Tabs.Screen
        options={{
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />

      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Alerts</Text>
        {unreadCount > 0 && (
          <Pressable onPress={handleMarkAllRead}>
            <Text style={[styles.markAll, { color: colors.primary }]}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={data?.notifications ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 84 },
        ]}
        renderItem={({ item }) => {
          const icon = getIcon(item.type);
          return (
            <Pressable
              onPress={() => handleNotificationPress(item)}
              style={[
                styles.alertCard,
                { backgroundColor: item.isRead ? colors.card : colors.accent },
              ]}
            >
              <View style={[styles.iconContainer, { backgroundColor: icon.color + '20' }]}>
                <Feather name={icon.name} size={20} color={icon.color} />
              </View>
              <View style={styles.content}>
                <View style={styles.alertHeader}>
                  <Text
                    style={[
                      styles.alertTitle,
                      { color: colors.foreground },
                      !item.isRead && styles.alertTitleUnread,
                    ]}
                  >
                    {item.title}
                  </Text>
                  {!item.isRead && (
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); handleMarkOneRead(item.id); }}
                      style={[styles.markReadBtn, { backgroundColor: colors.primary + '18' }]}
                      hitSlop={8}
                    >
                      <Feather name="check" size={14} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
                <Text style={[styles.alertBody, { color: colors.secondaryForeground }]}>{item.body}</Text>
                <Text style={[styles.time, { color: colors.mutedForeground }]}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Feather name="bell-off" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No alerts</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
  },
  markAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  alertCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    gap: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  alertTitleUnread: {
    fontWeight: '800',
  },
  markReadBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  alertBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  time: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

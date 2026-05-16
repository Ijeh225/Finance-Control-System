import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import {
  useListAuditTrail,
  getListAuditTrailQueryKey,
  useListUsers,
  getListUsersQueryKey,
  type AuditEntry,
} from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

const PAGE_SIZE = 30;

const ACTION_FILTERS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: 'All' },
  { key: 'created', label: 'Created' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'held', label: 'On Hold' },
  { key: 'partial_approved', label: 'Partial' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'commented', label: 'Comment' },
  { key: 'edited', label: 'Edited' },
];

type ActionMeta = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
};

function getActionMeta(action: string, colors: ReturnType<typeof useColors>): ActionMeta {
  switch (action) {
    case 'created':
      return { label: 'Created', icon: 'plus-circle', color: '#6366F1' };
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
    default:
      return { label: action, icon: 'activity', color: colors.mutedForeground };
  }
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function billRef(billId: string): string {
  return `#${billId.slice(0, 8).toUpperCase()}`;
}

function AuditRow({ entry, colors }: { entry: AuditEntry; colors: ReturnType<typeof useColors> }) {
  const meta = getActionMeta(entry.action, colors);
  const hasBill = !!entry.billId;

  const handlePress = () => {
    if (hasBill) {
      router.push(`/bill/${entry.billId}`);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!hasBill}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && hasBill && { opacity: 0.7 },
      ]}
      accessibilityRole={hasBill ? 'button' : 'text'}
    >
      <View style={[styles.iconBadge, { backgroundColor: meta.color + '20' }]}>
        <Feather name={meta.icon} size={18} color={meta.color} />
      </View>

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <View style={[styles.actionPill, { backgroundColor: meta.color + '20' }]}>
            <Text style={[styles.actionLabel, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
            {formatRelative(entry.createdAt)}
          </Text>
        </View>

        <Text style={[styles.actor, { color: colors.foreground }]}>{entry.userName}</Text>

        {hasBill && (
          <Pressable
            onPress={handlePress}
            style={styles.billRef}
            accessibilityLabel={`Open bill ${billRef(entry.billId!)}`}
          >
            <Feather name="file-text" size={12} color={colors.primary} />
            <Text style={[styles.billRefText, { color: colors.primary }]}>
              Bill {billRef(entry.billId!)}
            </Text>
            <Feather name="chevron-right" size={12} color={colors.primary} />
          </Pressable>
        )}

        {entry.details ? (
          <Text style={[styles.details, { color: colors.secondaryForeground }]} numberOfLines={2}>
            {entry.details}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function AuditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [actorFilter, setActorFilter] = useState<string | undefined>(undefined);
  const isMd = user?.role === 'md';

  const { data: usersData } = useListUsers({
    query: { queryKey: getListUsersQueryKey(), enabled: isMd },
  });
  const assistants = useMemo(
    () => (usersData?.users ?? []).filter(u => u.isActive && u.role === 'payment_assistant'),
    [usersData]
  );

  const params = useMemo(
    () => ({
      limit,
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(actorFilter ? { userId: actorFilter } : {}),
    }),
    [limit, actionFilter, actorFilter]
  );

  const { data, isLoading, isFetching, refetch } = useListAuditTrail(params, {
    query: { queryKey: getListAuditTrailQueryKey(params), enabled: isMd },
  });

  const entries = data?.entries ?? [];
  const hasMore = entries.length >= limit;

  const handleLoadMore = useCallback(() => {
    setLimit(prev => prev + PAGE_SIZE);
  }, []);

  const handleActionFilter = useCallback((key: string | undefined) => {
    setActionFilter(key);
    setLimit(PAGE_SIZE);
  }, []);

  const handleActorFilter = useCallback((id: string | undefined) => {
    setActorFilter(id);
    setLimit(PAGE_SIZE);
  }, []);

  if (!isMd) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === 'web' ? 67 : insets.top,
          },
        ]}
      >
        <Feather name="lock" size={48} color={colors.muted} />
        <Text style={[styles.forbiddenTitle, { color: colors.foreground }]}>Access Restricted</Text>
        <Text style={[styles.forbiddenBody, { color: colors.mutedForeground }]}>
          The audit log is available to the MD only.
        </Text>
      </View>
    );
  }

  const renderFooter = () => {
    if (isFetching && entries.length > 0) {
      return <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />;
    }
    if (hasMore && !isFetching) {
      return (
        <Pressable
          onPress={handleLoadMore}
          style={[styles.loadMoreBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Text style={[styles.loadMoreText, { color: colors.primary }]}>Load more</Text>
        </Pressable>
      );
    }
    if (!hasMore && entries.length > 0) {
      return (
        <Text style={[styles.endText, { color: colors.mutedForeground }]}>
          All entries loaded
        </Text>
      );
    }
    return null;
  };

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
        <Text style={[styles.title, { color: colors.foreground }]}>Audit Log</Text>
        <View style={[styles.mdBadge, { backgroundColor: colors.primary + '20' }]}>
          <Feather name="shield" size={12} color={colors.primary} />
          <Text style={[styles.mdBadgeText, { color: colors.primary }]}>MD Only</Text>
        </View>
      </View>

      {/* Action type filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {ACTION_FILTERS.map(f => {
          const active = actionFilter === f.key;
          return (
            <Pressable
              key={f.key ?? '__all__'}
              onPress={() => handleActionFilter(f.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              accessibilityLabel={`Filter by ${f.label}`}
            >
              <Text style={[styles.filterChipText, { color: active ? '#fff' : colors.mutedForeground }]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Actor filter — only shown when there are assistants */}
      {assistants.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={[styles.filterScroll, { marginTop: -4 }]}
        >
          <Pressable
            onPress={() => handleActorFilter(undefined)}
            style={[
              styles.filterChip,
              styles.actorChip,
              {
                backgroundColor: !actorFilter ? colors.primary + '20' : colors.card,
                borderColor: !actorFilter ? colors.primary : colors.border,
              },
            ]}
            accessibilityLabel="Show all team members"
          >
            <Feather
              name="users"
              size={12}
              color={!actorFilter ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.filterChipText,
                { color: !actorFilter ? colors.primary : colors.mutedForeground },
              ]}
            >
              All
            </Text>
          </Pressable>
          {assistants.map(a => {
            const active = actorFilter === a.id;
            const firstName = a.name.split(' ')[0] ?? a.name;
            return (
              <Pressable
                key={a.id}
                onPress={() => handleActorFilter(active ? undefined : a.id)}
                style={[
                  styles.filterChip,
                  styles.actorChip,
                  {
                    backgroundColor: active ? colors.primary + '20' : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                accessibilityLabel={`Filter by ${a.name}`}
              >
                <Feather name="user" size={12} color={active ? colors.primary : colors.mutedForeground} />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {firstName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Active filter summary */}
      {(actionFilter || actorFilter) && (
        <View style={styles.activeFilterRow}>
          <Feather name="filter" size={12} color={colors.mutedForeground} />
          <Text style={[styles.activeFilterText, { color: colors.mutedForeground }]}>
            {[
              actionFilter
                ? ACTION_FILTERS.find(f => f.key === actionFilter)?.label
                : null,
              actorFilter
                ? assistants.find(a => a.id === actorFilter)?.name
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Pressable
            onPress={() => { handleActionFilter(undefined); handleActorFilter(undefined); }}
            style={styles.clearBtn}
            accessibilityLabel="Clear all filters"
          >
            <Text style={[styles.clearBtnText, { color: colors.primary }]}>Clear</Text>
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 84 },
          ]}
          renderItem={({ item }) => <AuditRow entry={item} colors={colors} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="activity" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {actionFilter || actorFilter ? 'No entries match these filters' : 'No audit entries yet'}
              </Text>
            </View>
          }
          onRefresh={refetch}
          refreshing={isFetching && entries.length === 0}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  forbiddenTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  forbiddenBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
  mdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mdBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  actorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  activeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  activeFilterText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  rowContent: {
    flex: 1,
    gap: 5,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 12,
    fontWeight: '500',
  },
  actor: {
    fontSize: 15,
    fontWeight: '700',
  },
  billRef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  billRefText: {
    fontSize: 12,
    fontWeight: '600',
  },
  details: {
    fontSize: 13,
    lineHeight: 18,
  },
  loadMoreBtn: {
    margin: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  endText: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 13,
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
    textAlign: 'center',
  },
});

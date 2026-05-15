import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useGetScheduledTomorrow, getGetScheduledTomorrowQueryKey } from '@workspace/api-client-react';
import { useUser } from '@/context/UserContext';
import { BillCard } from '@/components/finance/BillCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScheduledTomorrowScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useUser();

  const { data, isLoading } = useGetScheduledTomorrow(
    { userId: userId === 'all' ? undefined : userId },
    { query: { queryKey: getGetScheduledTomorrowQueryKey({ userId: userId === 'all' ? undefined : userId }) } }
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={data?.bills || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BillCard bill={item} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 20 }
        ]}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={{ color: colors.mutedForeground }}>No bills scheduled for tomorrow</Text>
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
  listContent: {
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
});

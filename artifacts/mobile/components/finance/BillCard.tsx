import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Bill } from '@workspace/api-client-react';
import { AmountText } from './AmountText';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { router } from 'expo-router';

interface BillCardProps {
  bill: Bill;
}

export const BillCard: React.FC<BillCardProps> = ({ bill }) => {
  const colors = useColors();

  return (
    <Pressable
      onPress={() => router.push(`/bill/${bill.id}`)}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.7 }
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.vendor, { color: colors.foreground }]} numberOfLines={1}>
          {bill.vendorName}
        </Text>
        <AmountText amount={bill.amount} style={[styles.amount, { color: colors.primary }]} />
      </View>
      
      <Text style={[styles.description, { color: colors.secondaryForeground }]} numberOfLines={1}>
        {bill.description}
      </Text>

      <View style={styles.footer}>
        <View style={styles.badges}>
          <StatusBadge status={bill.status} />
          <PriorityBadge priority={bill.priority} />
        </View>
        <View style={styles.dateContainer}>
          <Feather name="calendar" size={12} color={colors.mutedForeground} />
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {new Date(bill.scheduledDate).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vendor: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  date: {
    fontSize: 12,
  },
});

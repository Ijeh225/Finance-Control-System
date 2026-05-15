import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BillStatus } from '@workspace/api-client-react';

interface StatusBadgeProps {
  status: BillStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const colors = useColors();

  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return { color: colors.warning, label: 'Pending' };
      case 'approved':
        return { color: colors.success, label: 'Approved' };
      case 'rejected':
        return { color: colors.destructive, label: 'Rejected' };
      case 'on_hold':
        return { color: '#F59E0B', label: 'On Hold' }; // orange
      case 'partial':
        return { color: '#3B82F6', label: 'Partial' }; // blue
      case 'paid':
        return { color: '#15803D', label: 'Paid' }; // darker green
      case 'overdue':
        return { color: colors.destructive, label: 'Overdue' };
      default:
        return { color: colors.mutedForeground, label: status };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={[styles.badge, { borderColor: config.color }]}>
      <Text style={[styles.text, { color: config.color }]}>{config.label.toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
  },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BillPriority } from '@workspace/api-client-react';

interface PriorityBadgeProps {
  priority: BillPriority;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority }) => {
  const colors = useColors();

  const getPriorityConfig = () => {
    switch (priority) {
      case 'low':
        return { color: colors.mutedForeground, label: 'Low' };
      case 'medium':
        return { color: '#3B82F6', label: 'Medium' };
      case 'high':
        return { color: '#F59E0B', label: 'High' };
      case 'urgent':
        return { color: colors.destructive, label: 'Urgent' };
      default:
        return { color: colors.mutedForeground, label: priority };
    }
  };

  const config = getPriorityConfig();

  return (
    <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
  },
});

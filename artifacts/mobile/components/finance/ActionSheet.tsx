import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ActionOption {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  requiresAmount?: boolean;
}

interface ActionSheetProps {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  options: ActionOption[];
  onAction: (actionId: string, comment: string, amount?: number) => Promise<void>;
  isLoading?: boolean;
}

export const ActionSheet: React.FC<ActionSheetProps> = ({
  isVisible,
  onClose,
  title,
  options,
  onAction,
  isLoading
}) => {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedAction, setSelectedAction] = useState<ActionOption | null>(null);
  const [comment, setComment] = useState('');
  const [amount, setAmount] = useState('');

  const handleAction = async () => {
    if (!selectedAction) return;
    await onAction(selectedAction.id, comment, amount ? parseFloat(amount) : undefined);
    setComment('');
    setAmount('');
    setSelectedAction(null);
    onClose();
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable 
          style={[
            styles.content, 
            { 
              backgroundColor: colors.card,
              paddingBottom: Math.max(insets.bottom, 24)
            }
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>

          {!selectedAction ? (
            <View style={styles.optionsGrid}>
              {options.map((option) => (
                <Pressable
                  key={option.id}
                  style={[styles.option, { backgroundColor: colors.secondary }]}
                  onPress={() => setSelectedAction(option)}
                >
                  <Feather name={option.icon} size={24} color={option.color} />
                  <Text style={[styles.optionLabel, { color: colors.foreground }]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.formHeader}>
                <Pressable onPress={() => setSelectedAction(null)}>
                  <Feather name="arrow-left" size={24} color={colors.foreground} />
                </Pressable>
                <Text style={[styles.selectedTitle, { color: colors.foreground }]}>
                  {selectedAction.label}
                </Text>
              </View>

              {selectedAction.requiresAmount && (
                <TextInput
                  style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
                  placeholder="Amount"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
              )}

              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
                placeholder="Add a comment..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                value={comment}
                onChangeText={setComment}
              />

              <Pressable
                style={[styles.submitButton, { backgroundColor: selectedAction.color }]}
                onPress={handleAction}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Confirm {selectedAction.label}</Text>
                )}
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    minHeight: 300,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  option: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  form: {
    gap: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  selectedTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

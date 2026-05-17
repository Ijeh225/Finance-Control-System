import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, Platform,
  Modal, Pressable, TextInput, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useLocalSearchParams, router } from 'expo-router';
import {
  useGetWallet, getGetWalletQueryKey,
  useListWallets, getListWalletsQueryKey,
  useTransferFunds,
  useUpdateWallet,
  getGetWalletStatementQueryKey,
} from '@workspace/api-client-react';
import type { WalletTransaction } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountText } from '@/components/finance/AmountText';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';

const TX_LABELS: Record<string, string> = {
  credit: 'Credit',
  debit: 'Debit',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  bill_payment: 'Bill Payment',
};

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const colors = useColors();
  const isCredit = tx.type === 'credit' || tx.type === 'transfer_in';
  return (
    <View style={[styles.txRow, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.txNarration, { color: colors.foreground }]} numberOfLines={1}>{tx.narration}</Text>
        <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
          {TX_LABELS[tx.type] ?? tx.type}
          {tx.relatedWalletName ? ` · ${tx.relatedWalletName}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.txAmount, { color: isCredit ? colors.primary : '#e53e3e' }]}>
          {isCredit ? '+' : '-'}
        </Text>
        <AmountText amount={tx.amount} style={[styles.txAmount, { color: isCredit ? colors.primary : '#e53e3e' }]} />
        <AmountText amount={tx.balanceAfter} style={[styles.txBalance, { color: colors.mutedForeground }]} />
      </View>
    </View>
  );
}

type WalletItem = { id: string; name: string; balance: number; currency: string | null };

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [showTransfer, setShowTransfer] = useState(false);
  const [fromWalletId, setFromWalletId] = useState(id ?? '');
  const [toWalletId, setToWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [pickingWallet, setPickingWallet] = useState<'from' | 'to' | null>(null);
  const [transferError, setTransferError] = useState('');

  const [showFundWallet, setShowFundWallet] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundSource, setFundSource] = useState('');
  const [fundError, setFundError] = useState('');

  const { data: wallet, isLoading } = useGetWallet(
    id as string,
    { query: { enabled: !!id, queryKey: getGetWalletQueryKey(id as string) } }
  );

  const { data: walletsData } = useListWallets(undefined, {
    query: { queryKey: getListWalletsQueryKey() },
  });

  const allWallets: WalletItem[] = (walletsData?.wallets ?? []).map(w => ({
    id: w.id,
    name: w.name,
    balance: w.balance ?? 0,
    currency: w.currency ?? 'NGN',
  }));

  const transferMutation = useTransferFunds({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWalletQueryKey(id as string) });
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        closeTransfer();
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setTransferError(msg ?? 'Transfer failed. Please try again.');
      },
    },
  });

  const fundMutation = useUpdateWallet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWalletQueryKey(id as string) });
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetWalletStatementQueryKey(id as string) });
        setShowFundWallet(false);
        setFundAmount('');
        setFundSource('');
        setFundError('');
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        setFundError(msg ?? 'Could not add funds. Please try again.');
      },
    },
  });

  const openFundWallet = () => {
    setFundAmount('');
    setFundSource('');
    setFundError('');
    setShowFundWallet(true);
  };

  const handleFundWallet = () => {
    setFundError('');
    const amt = parseFloat(fundAmount);
    if (!amt || amt <= 0) { setFundError('Enter a valid amount.'); return; }
    if (!fundSource.trim()) { setFundError('Describe the source of these funds.'); return; }
    fundMutation.mutate({
      id: id as string,
      data: {
        balance: (wallet?.balance ?? 0) + amt,
        narration: fundSource.trim(),
      },
    });
  };

  const openTransfer = () => {
    setFromWalletId(id ?? '');
    setToWalletId('');
    setAmount('');
    setNarration('');
    setTransferError('');
    setShowTransfer(true);
  };

  const closeTransfer = () => {
    setShowTransfer(false);
    setPickingWallet(null);
    setTransferError('');
  };

  const handleTransfer = () => {
    setTransferError('');
    const amt = parseFloat(amount);
    if (!fromWalletId || !toWalletId) { setTransferError('Select both wallets.'); return; }
    if (fromWalletId === toWalletId) { setTransferError('Source and destination must differ.'); return; }
    if (!amt || amt <= 0) { setTransferError('Enter a valid amount.'); return; }
    if (!narration.trim()) { setTransferError('Enter a narration.'); return; }

    transferMutation.mutate({
      data: { fromWalletId, toWalletId, amount: amt, narration: narration.trim() },
    });
  };

  const fromWallet = allWallets.find(w => w.id === fromWalletId);
  const toWallet = allWallets.find(w => w.id === toWalletId);

  const formatAmt = (val: number) =>
    '₦' + val.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (isLoading || !wallet) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={wallet.recentTransactions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
              <Text style={[styles.bankLabel, { color: colors.primaryForeground }]}>
                {wallet.bankName} • {wallet.name}
              </Text>
              <AmountText
                amount={wallet.balance}
                style={[styles.balanceAmount, { color: colors.primaryForeground }]}
              />
              <Text style={[styles.accountNumber, { color: colors.primaryForeground }]}>
                {wallet.accountNumber}
              </Text>
              <View style={styles.balanceActions}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.primaryForeground + '22' }]}
                  onPress={openFundWallet}
                >
                  <Feather name="trending-up" size={15} color={colors.primaryForeground} />
                  <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>
                    Fund Wallet
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.primaryForeground + '22' }]}
                  onPress={openTransfer}
                >
                  <Feather name="arrow-right-circle" size={15} color={colors.primaryForeground} />
                  <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>
                    Transfer Funds
                  </Text>
                </Pressable>
              </View>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Transactions</Text>
          </View>
        }
        renderItem={({ item }) => <TransactionRow tx={item} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 20 }
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ color: colors.mutedForeground }}>No recent transactions</Text>
          </View>
        }
      />

      {/* Transfer Modal */}
      <Modal visible={showTransfer} animationType="slide" transparent onRequestClose={closeTransfer}>
        <Pressable style={styles.modalOverlay} onPress={closeTransfer}>
          <Pressable onPress={e => e.stopPropagation()} style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              {/* Header */}
              <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Transfer Funds</Text>
                <Pressable onPress={closeTransfer} hitSlop={12}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
                {/* From Wallet */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>FROM WALLET</Text>
                  <Pressable
                    style={[styles.picker, { borderColor: colors.border, backgroundColor: colors.background }]}
                    onPress={() => setPickingWallet('from')}
                  >
                    <Text style={[styles.pickerText, { color: fromWallet ? colors.foreground : colors.mutedForeground }]}>
                      {fromWallet ? `${fromWallet.name}  —  ${formatAmt(fromWallet.balance)}` : 'Select source wallet'}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* To Wallet */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>TO WALLET</Text>
                  <Pressable
                    style={[styles.picker, { borderColor: colors.border, backgroundColor: colors.background }]}
                    onPress={() => setPickingWallet('to')}
                  >
                    <Text style={[styles.pickerText, { color: toWallet ? colors.foreground : colors.mutedForeground }]}>
                      {toWallet ? `${toWallet.name}  —  ${formatAmt(toWallet.balance)}` : 'Select destination wallet'}
                    </Text>
                    <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                {/* Amount */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AMOUNT (₦)</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>

                {/* Narration */}
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NARRATION</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    placeholder="Purpose of transfer"
                    placeholderTextColor={colors.mutedForeground}
                    value={narration}
                    onChangeText={setNarration}
                  />
                </View>

                {!!transferError && (
                  <Text style={styles.errorText}>{transferError}</Text>
                )}
              </ScrollView>

              {/* Actions */}
              <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
                <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={closeTransfer}>
                  <Text style={{ color: colors.foreground, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: colors.primary, opacity: transferMutation.isPending ? 0.6 : 1 }]}
                  onPress={handleTransfer}
                  disabled={transferMutation.isPending}
                >
                  <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>
                    {transferMutation.isPending ? 'Transferring…' : 'Confirm Transfer'}
                  </Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fund Wallet Modal */}
      <Modal visible={showFundWallet} animationType="slide" transparent onRequestClose={() => setShowFundWallet(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFundWallet(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Fund Wallet</Text>
                <Pressable onPress={() => setShowFundWallet(false)} hitSlop={12}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AMOUNT (₦) *</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={fundAmount}
                    onChangeText={setFundAmount}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SOURCE OF FUNDS / DESCRIPTION *</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    placeholder="e.g. Client payment received, office cash injection…"
                    placeholderTextColor={colors.mutedForeground}
                    value={fundSource}
                    onChangeText={setFundSource}
                  />
                  <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                    Describe where this money is coming from — it will appear in the ledger.
                  </Text>
                </View>

                {wallet && fundAmount && parseFloat(fundAmount) > 0 && (
                  <View style={[styles.balancePreview, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                    <View style={styles.balancePreviewRow}>
                      <Text style={[styles.balancePreviewLabel, { color: colors.mutedForeground }]}>Current balance</Text>
                      <Text style={[styles.balancePreviewValue, { color: colors.mutedForeground }]}>{formatAmt(wallet.balance ?? 0)}</Text>
                    </View>
                    <View style={styles.balancePreviewRow}>
                      <Text style={[styles.balancePreviewLabel, { color: colors.foreground, fontWeight: '700' }]}>New balance</Text>
                      <Text style={[styles.balancePreviewValue, { color: colors.primary, fontWeight: '700' }]}>
                        {formatAmt((wallet.balance ?? 0) + parseFloat(fundAmount))}
                      </Text>
                    </View>
                  </View>
                )}

                {!!fundError && (
                  <Text style={styles.errorText}>{fundError}</Text>
                )}
              </ScrollView>

              <View style={[styles.sheetFooter, { borderTopColor: colors.border }]}>
                <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowFundWallet(false)}>
                  <Text style={{ color: colors.foreground, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: colors.primary, opacity: fundMutation.isPending ? 0.6 : 1 }]}
                  onPress={handleFundWallet}
                  disabled={fundMutation.isPending}
                >
                  <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>
                    {fundMutation.isPending ? 'Adding Funds…' : 'Add Funds'}
                  </Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Wallet Picker Modal */}
      <Modal visible={!!pickingWallet} animationType="fade" transparent onRequestClose={() => setPickingWallet(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickingWallet(null)}>
          <Pressable onPress={e => e.stopPropagation()} style={[styles.pickerModal, { backgroundColor: colors.card }]}>
            <Text style={[styles.pickerModalTitle, { color: colors.foreground, borderBottomColor: colors.border }]}>
              {pickingWallet === 'from' ? 'Select Source Wallet' : 'Select Destination Wallet'}
            </Text>
            <ScrollView>
              {allWallets
                .filter(w => pickingWallet === 'from' ? w.id !== toWalletId : w.id !== fromWalletId)
                .map(w => (
                  <Pressable
                    key={w.id}
                    style={[styles.pickerOption, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      if (pickingWallet === 'from') setFromWalletId(w.id);
                      else setToWalletId(w.id);
                      setPickingWallet(null);
                    }}
                  >
                    <Text style={[styles.pickerOptionName, { color: colors.foreground }]}>{w.name}</Text>
                    <Text style={[styles.pickerOptionBalance, { color: colors.mutedForeground }]}>{formatAmt(w.balance)}</Text>
                  </Pressable>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, gap: 24 },
  balanceCard: { padding: 24, borderRadius: 24, gap: 12 },
  bankLabel: { fontSize: 14, fontWeight: '700', opacity: 0.8 },
  balanceAmount: { fontSize: 36, fontWeight: '800' },
  accountNumber: { fontSize: 16, fontWeight: '600', letterSpacing: 2, opacity: 0.9 },
  balanceActions: {
    flexDirection: 'row', gap: 10, marginTop: 4,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  listContent: { paddingBottom: 20 },
  emptyState: { alignItems: 'center', padding: 40 },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, gap: 12,
  },
  txNarration: { fontSize: 14, fontWeight: '600' },
  txMeta: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  txBalance: { fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 24, maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetFooter: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1,
  },
  field: { paddingHorizontal: 20, paddingTop: 16, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  pickerText: { fontSize: 14, flex: 1 },
  textInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14,
  },
  errorText: {
    marginHorizontal: 20, marginTop: 10,
    color: '#e53e3e', fontSize: 13, fontWeight: '600',
  },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  confirmBtn: {
    flex: 2, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  // Wallet Picker modal
  pickerModal: {
    margin: 24, borderRadius: 16, maxHeight: '70%', overflow: 'hidden',
  },
  pickerModalTitle: {
    fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  pickerOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  pickerOptionName: { fontSize: 15, fontWeight: '600', flex: 1 },
  pickerOptionBalance: { fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
  fieldHint: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  balancePreview: {
    marginHorizontal: 20, marginTop: 16,
    borderWidth: 1, borderRadius: 12, padding: 14, gap: 8,
  },
  balancePreviewRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  balancePreviewLabel: { fontSize: 13 },
  balancePreviewValue: { fontSize: 14, fontVariant: ['tabular-nums'] },
});

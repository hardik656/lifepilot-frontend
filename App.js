import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity, FlatList, TextInput, Alert, Keyboard, TouchableWithoutFeedback, ActivityIndicator, Modal, LayoutAnimation } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getSubscriptionData, parseSMS, clearDatabase } from './services/api';
import Svg, { Circle } from 'react-native-svg';

const Tab = createBottomTabNavigator();

const RING_SIZE = 88;
const RING_R = 40;
const RING_STROKE = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
const STORAGE_KEY = '@lifepilot/dashboard';

async function loadFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      subs: Array.isArray(data.subs) ? data.subs : [],
      moneySaved: typeof data.moneySaved === 'number' ? data.moneySaved : 0,
    };
  } catch {
    return null;
  }
}

async function saveToStorage(subs, moneySaved) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ subs: subs || [], moneySaved: moneySaved ?? 0 }));
  } catch (e) {
    console.warn('Failed to save to storage', e);
  }
}

const getIcon = (name) => {
  const merchant = name.toLowerCase();
  // 🎬 Entertainment & Media
  if (merchant.includes('netflix')) return '🎬';
  if (merchant.includes('disney')) return '🏰';
  if (merchant.includes('hulu') || merchant.includes('hbo')) return '📺';
  if (merchant.includes('youtube')) return '🔴';
  if (merchant.includes('spotify')) return '🎧';
  if (merchant.includes('apple music')) return '🍎';
  if (merchant.includes('audible')) return '📖';
  // ☁️ Tech, Cloud & AI
  if (merchant.includes('icloud') || merchant.includes('apple')) return '☁️';
  if (merchant.includes('google') || merchant.includes('drive')) return '🤖';
  if (merchant.includes('chatgpt') || merchant.includes('openai')) return '🧠';
  if (merchant.includes('adobe') || merchant.includes('canva')) return '🎨';
  if (merchant.includes('microsoft') || merchant.includes('office')) return '💻';
  // 💪 Health, Fitness & Wellness
  if (merchant.includes('gym') || merchant.includes('fitness')) return '🏋️';
  if (merchant.includes('yoga') || merchant.includes('calm') || merchant.includes('headspace')) return '🧘';
  // 🛍️ Shopping, Delivery & Transport
  if (merchant.includes('amazon')) return '📦';
  if (merchant.includes('instacart') || merchant.includes('doordash') || merchant.includes('uber eats')) return '🍕';
  if (merchant.includes('uber') || merchant.includes('lyft') || merchant.includes('grab')) return '🚗';
  // 🏠 Utilities & Housing
  if (merchant.includes('rent') || merchant.includes('mortgage')) return '🏠';
  if (merchant.includes('electric') || merchant.includes('water') || merchant.includes('gas')) return '⚡';
  return '💳'; // Default icon
};

// --- useSubscriptions: hydration, API sync, persist, parse + haptic ---
function useSubscriptions() {
  const [moneySaved, setMoneySaved] = useState(0);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadFromStorage();
      if (cancelled) return;
      if (stored) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setSubs(stored.subs);
        setMoneySaved(stored.moneySaved);
      }
      const data = await getSubscriptionData();
      if (cancelled) return;
      if (data) {
        const nextSubs = data.subscriptions || [];
        const nextSaved = data.total_savings ?? 0;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setSubs(nextSubs);
        setMoneySaved(nextSaved);
        await saveToStorage(nextSubs, nextSaved);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDetect = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const data = await getSubscriptionData();
    if (data) {
      const nextSubs = data.subscriptions || [];
      const nextSaved = data.total_savings ?? 0;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      setSubs(nextSubs);
      setMoneySaved(nextSaved);
      await saveToStorage(nextSubs, nextSaved);
    }
    if (showLoading) setLoading(false);
  };

  const handleResetData = async () => {
    await clearDatabase();
    await handleDetect(true);
    Alert.alert("Pilot Reset", "Database is clean.");
  };

  const handleParseSMSWithText = async (text) => {
    if (!text?.trim()) return false;
    const result = await parseSMS(text);
    if (result && result.parsed_transactions > 0) {
      await handleDetect();
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (_) {}
      Alert.alert('Pilot Active', 'Savings identified!');
      return true;
    }
    Alert.alert('Pilot Check', 'No new recurring bills found.');
    return false;
  };

  return { subs, moneySaved, loading, handleDetect, handleResetData, handleParseSMSWithText };
}

// --- 1. DASHBOARD SCREEN (Bento Grid, Cyber theme + FAB) ---
function DashboardScreen({ moneySaved, subs, onReset, onProcessSMS }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [fabSmsText, setFabSmsText] = useState('');

  const totalMonthlySpend = subs.reduce((sum, s) => sum + (Number(s.monthly_cost) || 0), 0);
  const upcomingCount = subs.length;
  // Pilot Score: fewer subs = healthier (0 subs = 100, ~10+ = 0)
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - subs.length * 10)));
  // FV of annuity: FV = P * (((1 + r)^n - 1) / r); P = annual contribution, r = 8%, n = 10 yrs
  const annualContribution = moneySaved * 12;
  const r = 0.08;
  const n = 10;
  const futureValue10y = isFinite(annualContribution) ? annualContribution * (((1 + r) ** n - 1) / r) : 0;

  const handleProcessFromModal = async () => {
    Keyboard.dismiss();
    if (!fabSmsText.trim()) {
      Alert.alert('Error', 'Paste a bank SMS first.');
      return;
    }
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (_) {}
    const success = await onProcessSMS(fabSmsText);
    setModalVisible(false);
    setFabSmsText('');
    if (success) Alert.alert('Pilot Active', 'Savings identified!');
    else Alert.alert('Pilot Check', 'No new recurring bills found.');
  };

  return (
    <View style={styles.dashboardWrapper}>
      <SafeAreaView style={styles.dashboardContainer}>
        {/* Bento Grid — 3 cards at top */}
        <View style={styles.bentoGrid}>
          <View style={styles.bentoCard}>
            <Text style={styles.bentoLabel}>Total Monthly Spend</Text>
            <Text style={styles.bentoValue}>${totalMonthlySpend.toFixed(0)}</Text>
          </View>
          <View style={styles.bentoCard}>
            <Text style={styles.bentoLabel}>Upcoming Subs</Text>
            <Text style={styles.bentoValue}>{upcomingCount}</Text>
          </View>
          <View style={styles.bentoCard}>
            <Text style={styles.bentoLabel}>Potential Savings</Text>
            <Text style={styles.bentoValue}>${moneySaved}</Text>
          </View>
        </View>

        {/* Pilot Score — circular progress ring */}
        <View style={styles.bentoCardWide}>
          <Text style={styles.bentoLabel}>Pilot Score</Text>
          <View style={styles.ringRow}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
              <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_R} stroke="rgba(51, 65, 85, 0.8)" strokeWidth={RING_STROKE} fill="none" />
              <Circle
                cx={RING_SIZE/2}
                cy={RING_SIZE/2}
                r={RING_R}
                stroke="#10b981"
                strokeWidth={RING_STROKE}
                fill="none"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - healthScore / 100)}
                strokeLinecap="round"
                transform={`rotate(-90 ${RING_SIZE/2} ${RING_SIZE/2})`}
              />
            </Svg>
            <Text style={styles.healthScoreText}>{healthScore}</Text>
          </View>
        </View>

        {/* Secondary section — yearly goal with 8% FV formula */}
        <View style={styles.bentoCardWide}>
          <Text style={styles.bentoLabel}>Yearly Savings Goal</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(((moneySaved * 12) / 2000) * 100, 100)}%` }]} />
          </View>
          <Text style={styles.cyberAccent}>
            If invested (8%/yr): ${futureValue10y.toFixed(0)} in 10 yrs
          </Text>
        </View>

        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => Alert.alert(
            'Reset Pilot?',
            'This wipes all saved data for testing.',
            [{ text: 'Cancel' }, { text: 'Wipe Data', onPress: onReset, style: 'destructive' }]
          )}
        >
          <Text style={styles.resetButtonText}>Reset data</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* FAB — bottom right, neon emerald, plus icon */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.9}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Modal — paste bank SMS, Process calls parseSMS and updates Bento */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay} pointerEvents="box-none">
            <View style={styles.modalContent} pointerEvents="box-none">
              <Text style={styles.modalTitle}>Paste bank SMS</Text>
              <View style={styles.modalInputContainer}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Debit $45.00 at Netflix..."
                  placeholderTextColor="#64748b"
                  value={fabSmsText}
                  onChangeText={(text) => setFabSmsText(text)}
                  multiline
                  numberOfLines={4}
                  autoFocus={true}
                  blurOnSubmit={false}
                  selectTextOnFocus={true}
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => { setModalVisible(false); setFabSmsText(''); }}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalProcess} onPress={handleProcessFromModal}>
                  <Text style={styles.modalProcessText}>Process</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// --- 2. SCANNER SCREEN (local state for typing, no heavy work until Process) ---
function ScannerScreen({ onProcessSMS }) {
  const [localSmsText, setLocalSmsText] = useState('');

  const handleAnalyze = async () => {
    Keyboard.dismiss();
    if (!localSmsText.trim()) return Alert.alert('Error', 'Paste a message first!');
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (_) {}
    const success = await onProcessSMS(localSmsText);
    if (success) setLocalSmsText('');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <View style={styles.inputContainer}>
          <Text style={[styles.label, { marginBottom: 10 }]}>Paste Bank SMS Below</Text>
          <View style={styles.scanInputContainer}>
            <TextInput
              style={[styles.input, styles.inputWebFriendly, { height: 120 }]}
              placeholder="Ex: Spent $15 to Netflix..."
              value={localSmsText}
              onChangeText={(text) => setLocalSmsText(text)}
              multiline
              placeholderTextColor="#94a3b8"
              autoFocus={true}
              blurOnSubmit={false}
              selectTextOnFocus={true}
            />
          </View>
          <TouchableOpacity style={styles.parseButton} onPress={handleAnalyze}>
            <Text style={styles.buttonText}>Analyze for Savings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

// --- 3. VAULT SCREEN (Your Subscriptions) ---
function VaultScreen({ subs, loading, handleCancelNow, handleRefresh }) {
  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>No transactions found.</Text>
      <Text style={styles.emptySubtext}>Scan a bank SMS or sync to see your subscriptions.</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ade80" style={styles.spinner} />
          <Text style={styles.loadingText}>Loading subscriptions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={subs}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={subs.length === 0 ? styles.emptyListContent : styles.listContent}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <View style={[styles.subItem, item.is_stale && styles.staleItem]}>
            <View style={styles.subItemRow}>
              <View style={styles.subIconWrap}>
                <Text style={styles.subIcon}>{getIcon(item.merchant)}</Text>
              </View>
              <View style={styles.subDetails}>
                <Text style={styles.subMerchant} numberOfLines={1}>{item.merchant}</Text>
                <Text style={styles.subCost}>${item.monthly_cost}<Text style={styles.subCostPeriod}>/mo</Text></Text>
              </View>
              {item.is_stale && (
                <TouchableOpacity style={styles.cancelButton} onPress={() => handleCancelNow(item.merchant)} activeOpacity={0.8}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
      <TouchableOpacity style={styles.syncButton} onPress={handleRefresh} activeOpacity={0.8}>
        <Text style={styles.syncButtonText}>Sync with Cloud</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const { subs, moneySaved, loading, handleDetect, handleResetData, handleParseSMSWithText } = useSubscriptions();

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{
        tabBarStyle: { backgroundColor: '#1e293b', borderTopWidth: 0, height: 60 },
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#10b981',
        tabBarInactiveTintColor: '#94a3b8',
      }}>
        <Tab.Screen name="Home">
          {() => (
            <DashboardScreen
              moneySaved={moneySaved}
              subs={subs}
              onReset={handleResetData}
              onProcessSMS={handleParseSMSWithText}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Scan">
          {() => <ScannerScreen onProcessSMS={handleParseSMSWithText} />}
        </Tab.Screen>
        <Tab.Screen name="Vault">
          {() => <VaultScreen subs={subs} loading={loading} handleRefresh={handleDetect} handleCancelNow={(m) => Alert.alert("Bot Active", `Canceling ${m}...`)} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// --- STYLES (bottom of file for readability) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  dashboardWrapper: { flex: 1 },
  dashboardContainer: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  fabIcon: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#0f172a', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInputContainer: { zIndex: 9999, elevation: 10 },
  modalInput: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, color: '#f8fafc', fontSize: 15, minHeight: 120, textAlignVertical: 'top', borderWidth: 1, borderColor: '#334155', outlineStyle: 'none' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  modalCancel: { paddingVertical: 12, paddingHorizontal: 20 },
  modalCancelText: { color: '#94a3b8', fontWeight: '600' },
  modalProcess: { backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  modalProcessText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  bentoGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  bentoCard: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    minHeight: 100,
    justifyContent: 'space-between',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  bentoCardWide: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    marginBottom: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  bentoLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  bentoValue: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  ringRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 16 },
  ringSvg: { alignSelf: 'center' },
  healthScoreText: { fontSize: 28, fontWeight: '800', color: '#10b981' },
  progressTrack: { height: 8, backgroundColor: 'rgba(30, 41, 59, 0.8)', borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10b981', borderRadius: 4 },
  cyberAccent: { fontSize: 12, color: '#10b981', fontWeight: '600', marginTop: 10 },
  resetButton: { alignSelf: 'center', marginTop: 16, paddingVertical: 10, paddingHorizontal: 16 },
  resetButtonText: { color: 'rgba(248, 113, 113, 0.9)', fontWeight: '600', fontSize: 12 },
  card: { backgroundColor: '#1e293b', padding: 20, borderRadius: 25, marginTop: 15, alignItems: 'center' },
  label: { fontSize: 13, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' },
  amount: { fontSize: 42, fontWeight: 'bold', color: '#4ade80' },
  progressBarContainer: { width: '100%', height: 14, backgroundColor: '#334155', borderRadius: 7, marginTop: 10, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#4ade80' },
  futureText: { fontSize: 13, color: '#4ade80', fontWeight: '700', marginTop: 10 },
  inputContainer: { marginTop: 20, flex: 1 },
  scanInputContainer: { zIndex: 9999, elevation: 10 },
  input: { backgroundColor: '#1e293b', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#334155', color: '#f8fafc', textAlignVertical: 'top' },
  inputWebFriendly: { outlineStyle: 'none' },
  parseButton: { backgroundColor: '#4ade80', padding: 15, borderRadius: 15, marginTop: 10 },
  buttonText: { color: '#0f172a', textAlign: 'center', fontSize: 18, fontWeight: 'bold' },
  subItem: { backgroundColor: '#1e293b', padding: 18, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(51, 65, 85, 0.6)' },
  subItemRow: { flexDirection: 'row', alignItems: 'center' },
  subIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(74, 222, 128, 0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  subIcon: { fontSize: 24 },
  subDetails: { flex: 1, minWidth: 0 },
  subMerchant: { color: '#f8fafc', fontSize: 17, fontWeight: '600', marginBottom: 2 },
  subCost: { color: '#4ade80', fontSize: 16, fontWeight: '700' },
  subCostPeriod: { color: '#64748b', fontWeight: '500', fontSize: 14 },
  staleItem: { borderColor: '#f43f5e', borderWidth: 2, backgroundColor: 'rgba(244, 63, 94, 0.06)' },
  cancelButton: { backgroundColor: '#f43f5e', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  cancelText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  button: { backgroundColor: '#38bdf8', padding: 15, borderRadius: 20, marginTop: 10 },
  syncButton: { backgroundColor: '#334155', padding: 16, borderRadius: 16, marginTop: 12, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.2)' },
  syncButtonText: { color: '#e2e8f0', textAlign: 'center', fontSize: 16, fontWeight: '600' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  spinner: { marginBottom: 16 },
  loadingText: { color: '#94a3b8', fontSize: 15, fontWeight: '500' },
  emptyListContent: { flexGrow: 1 },
  listContent: { paddingBottom: 24 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 16, opacity: 0.8 },
  emptyTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptySubtext: { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20 }
});
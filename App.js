import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity, FlatList, TextInput, Alert, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getSubscriptionData, parseSMS, clearDatabase } from './services/api';

const Tab = createBottomTabNavigator();

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

// --- 1. DASHBOARD SCREEN (Updated with Reset) ---
function DashboardScreen({ moneySaved, onReset }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Yearly Savings Goal: $2,000</Text>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${Math.min(((moneySaved * 12) / 2000) * 100, 100)}%` }]} />
        </View>
        <Text style={styles.futureText}>💰 If Invested: ${((moneySaved * 12) * 13.8).toFixed(2)} in 10yrs</Text>
      </View>
      <View style={[styles.card, { alignItems: 'flex-start' }]}>
        <Text style={styles.label}>Savings Analysis</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 100, marginTop: 20, width: '100%', justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 32, height: 30, backgroundColor: '#334155', borderRadius: 8 }} />
            <Text style={{ color: '#64748b', fontSize: 10, marginTop: 8 }}>Last Mo</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 32, height: 90, backgroundColor: '#4ade80', borderRadius: 8 }} />
            <Text style={{ color: '#4ade80', fontSize: 10, marginTop: 8, fontWeight: 'bold' }}>Current</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 32, height: 60, backgroundColor: '#38bdf8', borderRadius: 8, opacity: 0.5 }} />
            <Text style={{ color: '#38bdf8', fontSize: 10, marginTop: 8 }}>Target</Text>
          </View>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Total Monthly Savings</Text>
        <Text style={styles.amount}>${moneySaved}</Text>
      </View>
      {/* ⚠️ THE RESET BUTTON FOR TESTERS */}
      <TouchableOpacity
        style={{ marginTop: 20, alignSelf: 'center' }}
        onPress={() => Alert.alert(
          "Reset Pilot?",
          "This wipes all saved data for testing.",
          [{ text: "Cancel" }, { text: "Wipe Data", onPress: onReset, style: "destructive" }]
        )}
      >
        <Text style={{ color: '#f43f5e', fontWeight: 'bold', fontSize: 12 }}>RESTART MISSION (RESET)</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// --- 2. SCANNER SCREEN (No more clutter) ---
function ScannerScreen({ smsText, setSmsText, handleParseSMS }) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <View style={styles.inputContainer}>
          <Text style={[styles.label, { marginBottom: 10 }]}>Paste Bank SMS Below</Text>
          <TextInput
            style={[styles.input, { height: 120 }]}
            placeholder="Ex: Spent $15 to Netflix..."
            value={smsText}
            onChangeText={setSmsText}
            multiline
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.parseButton} onPress={handleParseSMS}>
            <Text style={styles.buttonText}>Analyze for Savings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

// --- 3. VAULT SCREEN (Your Subscriptions) ---
function VaultScreen({ subs, handleCancelNow, handleRefresh }) {
  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={subs}
        keyExtractor={(item, index) => index.toString()}
        ListEmptyComponent={
          <Text style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40 }}>🛰️ Scanning for bills...</Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.subItem, item.is_stale && styles.staleItem]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 30, marginRight: 15 }}>{getIcon(item.merchant)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#f8fafc', fontSize: 18, fontWeight: '700' }}>{item.merchant}</Text>
                <Text style={{ color: '#4ade80', fontWeight: 'bold' }}>${item.monthly_cost}/mo</Text>
              </View>
              {item.is_stale && (
                <TouchableOpacity style={styles.cancelButton} onPress={() => handleCancelNow(item.merchant)}>
                  <Text style={styles.cancelText}>DEPLOY BOT</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
      <TouchableOpacity style={styles.button} onPress={handleRefresh}>
        <Text style={styles.buttonText}>Sync with Cloud</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const [moneySaved, setMoneySaved] = useState(0);
  const [subs, setSubs] = useState([]);
  const [smsText, setSmsText] = useState('');

  useEffect(() => { handleDetect(); }, []);

  const handleDetect = async () => {
    const data = await getSubscriptionData();
    if (data) {
      setMoneySaved(data.total_savings || 0);
      setSubs(data.subscriptions || []);
    }
  };

  const handleResetData = async () => {
    await clearDatabase();
    handleDetect();
    Alert.alert("Pilot Reset", "Database is clean.");
  };

  const handleParseSMS = async () => {
    Keyboard.dismiss();
    if (!smsText.trim()) return Alert.alert("Error", "Paste a message first!");
    const result = await parseSMS(smsText);
    if (result && result.parsed_transactions > 0) {
      setSmsText('');
      handleDetect();
      Alert.alert("Pilot Active", "Savings identified!");
    } else {
      Alert.alert("Pilot Check", "No new recurring bills found.");
    }
  };

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{
        tabBarStyle: { backgroundColor: '#1e293b', borderTopWidth: 0, height: 60 },
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#4ade80',
        tabBarInactiveTintColor: '#94a3b8',
      }}>
        <Tab.Screen name="Home">
          {() => <DashboardScreen moneySaved={moneySaved} onReset={handleResetData} />}
        </Tab.Screen>
        <Tab.Screen name="Scan">
          {() => <ScannerScreen smsText={smsText} setSmsText={setSmsText} handleParseSMS={handleParseSMS} />}
        </Tab.Screen>
        <Tab.Screen name="Vault">
          {() => <VaultScreen subs={subs} handleRefresh={handleDetect} handleCancelNow={(m) => Alert.alert("Bot Active", `Canceling ${m}...`)} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  card: { backgroundColor: '#1e293b', padding: 20, borderRadius: 25, marginTop: 15, alignItems: 'center' },
  label: { fontSize: 13, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' },
  amount: { fontSize: 42, fontWeight: 'bold', color: '#4ade80' },
  progressBarContainer: { width: '100%', height: 14, backgroundColor: '#334155', borderRadius: 7, marginTop: 10, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#4ade80' },
  futureText: { fontSize: 13, color: '#4ade80', fontWeight: '700', marginTop: 10 },
  inputContainer: { marginTop: 20, flex: 1 },
  input: { backgroundColor: '#1e293b', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#334155', color: '#f8fafc', textAlignVertical: 'top' },
  parseButton: { backgroundColor: '#4ade80', padding: 15, borderRadius: 15, marginTop: 10 },
  buttonText: { color: '#0f172a', textAlign: 'center', fontSize: 18, fontWeight: 'bold' },
  subItem: { backgroundColor: '#1e293b', padding: 18, borderRadius: 18, marginBottom: 12 },
  staleItem: { borderColor: '#f43f5e', borderWidth: 2 },
  cancelButton: { backgroundColor: '#f43f5e', padding: 10, borderRadius: 10, marginTop: 10 },
  cancelText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
  button: { backgroundColor: '#38bdf8', padding: 15, borderRadius: 20, marginTop: 10 }
});
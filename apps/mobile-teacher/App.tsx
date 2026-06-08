import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Types ────────────────────────────────────────────────────────────────────

type LoginResponse = {
  token: string;
  user: { id: string; name: string; role: string };
};

type StockItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  availableQty: number;
  unit: string;
};

type RequestRecord = {
  id: string;
  status: string;
  lines: Array<{ item: { name: string }; quantityRequested: number }>;
};

type Issue = {
  id: string;
  issuedAt: string;
  lines: Array<{
    id: string;
    item: { name: string };
    quantityIssued: number;
    quantityReturned: number;
    dueDate?: string;
    isOverdue: boolean;
  }>;
};

type Tab = 'stock' | 'requests' | 'issues';

// ─── Status badge colors ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  SUBMITTED: '#f59e0b',
  APPROVED: '#22c55e',
  REJECTED: '#ef4444',
  PARTIALLY_ISSUED: '#3b82f6',
  FULLY_ISSUED: '#8b5cf6',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function StockCard({ item }: { item: StockItem }) {
  const low = item.availableQty <= 5;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.codeTag}>
          <Text style={styles.codeTagText}>{item.itemCode}</Text>
        </View>
        {low && (
          <View style={styles.lowBadge}>
            <Text style={styles.lowBadgeText}>LOW</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle}>{item.itemName}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.qtyLabel}>Available</Text>
        <Text style={[styles.qtyValue, low && { color: '#ef4444' }]}>
          {item.availableQty} {item.unit}
        </Text>
      </View>
    </View>
  );
}

function RequestCard({ item }: { item: RequestRecord }) {
  const color = STATUS_COLORS[item.status] || '#64748b';
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: color + '22', borderColor: color }]}>
          <Text style={[styles.statusBadgeText, { color }]}>{item.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>
      {item.lines.map((line, idx) => (
        <Text key={idx} style={styles.lineText}>
          • {line.item.name} — qty {line.quantityRequested}
        </Text>
      ))}
    </View>
  );
}

function IssueCard({ item }: { item: Issue }) {
  return (
    <View style={styles.card}>
      <Text style={styles.dateText}>{new Date(item.issuedAt).toLocaleDateString()}</Text>
      {item.lines.map((line) => (
        <View key={line.id} style={styles.issueLine}>
          <Text style={styles.lineText}>{line.item.name}</Text>
          <Text style={styles.lineSubText}>
            {line.quantityIssued} issued / {line.quantityReturned} returned
            {line.isOverdue ? '  ⚠ OVERDUE' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [email, setEmail] = useState('teacher@school.local');
  const [password, setPassword] = useState('Teacher@123');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('stock');
  const [loginError, setLoginError] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const apiRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  };

  const login = async () => {
    if (!email.trim() || !password.trim()) {
      setLoginError('Please enter email and password.');
      return;
    }
    setLoginError('');
    try {
      setLoading(true);
      const data = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setToken(data.token);
      setUser(data.user);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setLoginError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [stockData, requestData, issueData] = await Promise.all([
        apiRequest<StockItem[]>('/inventory/stock'),
        apiRequest<RequestRecord[]>('/requests'),
        apiRequest<Issue[]>('/issues'),
      ]);
      setStock(stockData);
      setRequests(requestData);
      setIssues(issueData);
      if (!selectedItemId && stockData[0]) setSelectedItemId(stockData[0].itemId);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, [token]);

  const submitRequest = async () => {
    if (!selectedItemId) { Alert.alert('Error', 'Please enter an Item ID.'); return; }
    try {
      setLoading(true);
      await apiRequest('/requests', {
        method: 'POST',
        body: JSON.stringify({ lines: [{ itemId: selectedItemId, quantityRequested: Number(qty) }] }),
      });
      Alert.alert('✓ Submitted', 'Your request was created successfully.');
      loadDashboard();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setStock([]);
    setRequests([]);
    setIssues([]);
  };

  // ── Login Screen ─────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.loginContainer}>
          <Animated.View style={{ opacity: fadeAnim, width: '100%' }}>

            <View style={styles.logoArea}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoIcon}>📦</Text>
              </View>
              <Text style={styles.appName}>StoreKeep</Text>
              <Text style={styles.appTagline}>School Inventory · Teacher Portal</Text>
            </View>

            <View style={styles.loginCard}>
              <Text style={styles.loginHeading}>Welcome back</Text>
              <Text style={styles.loginSubheading}>Sign in to your account</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setLoginError(''); }}
                  placeholder="teacher@school.local"
                  placeholderTextColor="#475569"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  selectionColor="#6366f1"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.textInput}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setLoginError(''); }}
                  placeholder="••••••••"
                  placeholderTextColor="#475569"
                  secureTextEntry
                  selectionColor="#6366f1"
                />
              </View>

              {loginError !== '' && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠ {loginError}</Text>
                </View>
              )}

              <Pressable
                style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }, loading && styles.loginBtnDisabled]}
                onPress={login}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.loginBtnText}>Sign In</Text>
                )}
              </Pressable>

              <Text style={styles.serverHint}>API: {API_BASE_URL}</Text>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Dashboard Screen ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Hello, {user?.name?.split(' ')[0] ?? 'Teacher'} 👋</Text>
          <Text style={styles.headerSub}>{user?.role}</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </View>

      {/* New Request Bar */}
      <View style={styles.requestBar}>
        <Text style={styles.requestBarLabel}>New Request</Text>
        <View style={styles.requestInputRow}>
          <TextInput
            style={[styles.textInput, { flex: 1, marginBottom: 0, marginRight: 8 }]}
            value={selectedItemId}
            onChangeText={setSelectedItemId}
            placeholder="Item ID"
            placeholderTextColor="#475569"
            selectionColor="#6366f1"
          />
          <TextInput
            style={[styles.textInput, { width: 70, marginBottom: 0, marginRight: 8, textAlign: 'center' }]}
            value={qty}
            onChangeText={setQty}
            keyboardType="number-pad"
            placeholder="Qty"
            placeholderTextColor="#475569"
            selectionColor="#6366f1"
          />
          <Pressable
            style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.8 }]}
            onPress={submitRequest}
            disabled={loading}
          >
            <Text style={styles.submitBtnText}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(['stock', 'requests', 'issues'] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'stock' ? `Stock (${stock.length})` : tab === 'requests' ? `Requests (${requests.length})` : `Issues (${issues.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Refresh row */}
      <View style={styles.refreshRow}>
        <Pressable onPress={loadDashboard} style={styles.refreshBtn} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#6366f1" /> : <Text style={styles.refreshText}>↻ Refresh</Text>}
        </Pressable>
      </View>

      {/* Lists */}
      {activeTab === 'stock' && (
        <FlatList
          data={stock}
          keyExtractor={(i) => i.itemId}
          renderItem={({ item }) => <StockCard item={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No stock data. Tap Refresh.</Text>}
        />
      )}
      {activeTab === 'requests' && (
        <FlatList
          data={requests}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <RequestCard item={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No requests yet.</Text>}
        />
      )}
      {activeTab === 'issues' && (
        <FlatList
          data={issues}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <IssueCard item={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No issued items.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  accent: '#6366f1',
  accentLight: '#818cf8',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  error: '#ef4444',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  // ── Login ──
  loginContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.accent + '22', borderWidth: 1.5, borderColor: C.accent,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  logoIcon: { fontSize: 36 },
  appName: { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  appTagline: { fontSize: 13, color: C.textMuted, marginTop: 4 },

  loginCard: {
    width: '100%', backgroundColor: C.surface,
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: C.border,
  },
  loginHeading: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 4 },
  loginSubheading: { fontSize: 14, color: C.textMuted, marginBottom: 24 },

  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: C.textMuted, marginBottom: 6 },
  textInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: C.text, fontSize: 15, marginBottom: 0,
  },

  errorBox: {
    backgroundColor: C.error + '18', borderWidth: 1, borderColor: C.error + '55',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText: { color: C.error, fontSize: 13 },

  loginBtn: {
    backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  serverHint: { color: '#334155', fontSize: 10, textAlign: 'center', marginTop: 16 },

  // ── Dashboard Header ──
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderColor: C.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  headerSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  logoutBtn: {
    backgroundColor: '#ef444422', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#ef444444',
  },
  logoutText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },

  // ── Request Bar ──
  requestBar: {
    margin: 16, backgroundColor: C.surface,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  requestBarLabel: { fontSize: 13, fontWeight: '700', color: C.textMuted, marginBottom: 10 },
  requestInputRow: { flexDirection: 'row', alignItems: 'center' },
  submitBtn: {
    backgroundColor: C.accent, width: 46, height: 46,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26 },

  // ── Tabs ──
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 4,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: C.accent },
  tabText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: '#fff' },

  // ── Refresh ──
  refreshRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 6 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6 },
  refreshText: { color: C.accent, fontSize: 13, fontWeight: '600' },

  // ── List / Cards ──
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  codeTag: {
    backgroundColor: C.accent + '22', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.accent + '44',
  },
  codeTagText: { color: C.accentLight, fontSize: 11, fontWeight: '700' },
  lowBadge: {
    backgroundColor: '#ef444422', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#ef444444',
  },
  lowBadgeText: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qtyLabel: { fontSize: 13, color: C.textMuted },
  qtyValue: { fontSize: 18, fontWeight: '700', color: '#22c55e' },

  statusBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  lineText: { fontSize: 14, color: C.text, paddingVertical: 3 },
  lineSubText: { fontSize: 12, color: C.textMuted },
  dateText: { fontSize: 12, color: C.textMuted, marginBottom: 8 },
  issueLine: { paddingVertical: 4, borderTopWidth: 1, borderColor: C.border, marginTop: 4 },

  emptyText: { color: C.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 40 },
});
